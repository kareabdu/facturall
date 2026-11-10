"use client";

import {
  aujourdhui,
  chargerEtatRapprochement,
  chargerOperationsAPointer,
  chargerReleve,
  comptabiliserLigneReleve,
  dernierReleveValide,
  depointerLigneReleve,
  enregistrerReleve,
  formaterDate,
  formaterXOF,
  LIBELLES_SOURCES,
  pointerLigneReleve,
  rapprocherAutomatiquement,
  resumeLignes,
  suggestionsPointage,
  supprimerLigneReleve,
  supprimerReleve,
  TYPES_TRESORERIE,
  validerReleve,
  type EtatRapprochement,
  type LigneImport,
  type LigneReleve,
  type OperationAPointer,
  type ReleveBancaire,
  type SourceReleve,
} from "@facturall/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { ChoixCompte } from "@/components/compta";
import { ChampMontantSigne, ImportReleve, MontantSigne, type ReleveImporte } from "@/components/rapprochement";
import { Alerte, Badge, Bouton, Carte, Champ, Chargement, Indicateur, Liste } from "@/components/ui";
import { useCompta } from "@/lib/compta";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

export default function PageReleve() {
  return (
    <Suspense fallback={<Chargement />}>
      <ChargeurReleve />
    </Suspense>
  );
}

function ChargeurReleve() {
  const params = useSearchParams();
  const id = params.get("id");
  const [version, setVersion] = useState(0);
  const cle = `${params.toString()}|${version}`;
  const [resultat, setResultat] = useState<{ cle: string; releve: ReleveBancaire } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let actif = true;
    chargerReleve(supabase, id)
      .then((releve) => actif && setResultat({ cle, releve }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [id, cle]);

  if (!id) return <NouveauReleve />;
  if (erreur) return <Alerte>{erreur}</Alerte>;
  // Pendant un rechargement, on garde l'affichage précédent du même relevé
  const releve = resultat && resultat.releve.id === id ? resultat.releve : null;
  if (!releve) return <Chargement />;
  return <Releve key={releve.id} releve={releve} version={version} recharger={() => setVersion((v) => v + 1)} />;
}

function EnTete({ titre, sousTitre, action }: { titre: string; sousTitre?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden">
      <div>
        <Link href="/comptabilite/rapprochement" className="text-sm text-muted hover:text-foreground">
          ← Relevés
        </Link>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{titre}</h2>
        {sousTitre && <p className="mt-1 text-sm text-muted">{sousTitre}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

function NouveauReleve() {
  const { entreprise } = useEspace();
  const { journaux, peutSaisir } = useCompta();
  const router = useRouter();
  const tresoreries = useMemo(() => journaux.filter((j) => j.actif && TYPES_TRESORERIE.includes(j.type)), [journaux]);
  const [journalId, setJournalId] = useState(tresoreries.find((j) => j.type === "banque")?.id ?? tresoreries[0]?.id ?? "");
  const [debut, setDebut] = useState("");
  // Vide : date de la dernière opération importée (ou aujourd'hui sans import)
  const [fin, setFin] = useState("");
  const [soldeInitial, setSoldeInitial] = useState<number | null>(null);
  const [soldeFinal, setSoldeFinal] = useState<number | null>(null);
  const [precedent, setPrecedent] = useState<{ journalId: string; releve: ReleveBancaire | null } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Le relevé suivant reprend le solde final et la date du dernier relevé validé du compte
  useEffect(() => {
    if (!journalId) return;
    let actif = true;
    dernierReleveValide(supabase, journalId)
      .then((releve) => actif && setPrecedent({ journalId, releve }))
      .catch(() => actif && setPrecedent({ journalId, releve: null }));
    return () => {
      actif = false;
    };
  }, [journalId]);
  const dernier = precedent?.journalId === journalId ? precedent.releve : null;
  const lendemain = dernier ? new Date(Date.parse(`${dernier.date_fin}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : "";
  const initial = soldeInitial ?? dernier?.solde_final ?? 0;

  if (!peutSaisir) return <Alerte>La saisie des relevés est réservée à la comptabilité.</Alerte>;
  if (tresoreries.length === 0) return <Alerte>Aucun journal de banque, de caisse ou de Mobile Money.</Alerte>;

  async function creer(import_?: ReleveImporte) {
    if (!entreprise) return;
    const resume = import_ ? resumeLignes(import_.lignes) : null;
    const dateFin = fin || resume?.fin || aujourdhui();
    const dateDebut = debut || lendemain || resume?.debut || dateFin;
    // Soldes : saisis > lus sur le relevé > repris du relevé précédent > calculés
    const soldeDepart = soldeInitial ?? import_?.soldes.initial ?? dernier?.solde_final ?? 0;
    setErreur(null);
    setEnvoi(true);
    try {
      const id = await enregistrerReleve(supabase, {
        entrepriseId: entreprise.entreprise_id,
        journalId,
        dateDebut: dateDebut < dateFin ? dateDebut : dateFin,
        dateFin,
        soldeInitial: soldeDepart,
        // Sans solde final saisi ni lu : celui que donnent les mouvements (à vérifier sur le relevé papier)
        soldeFinal: soldeFinal ?? import_?.soldes.final ?? soldeDepart + (resume?.total ?? 0),
        lignes: import_?.lignes,
        source: import_?.source ?? "manuel",
        fichier: import_?.fichier,
      });
      router.replace(`/comptabilite/rapprochement/releve?id=${id}`);
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(false);
    }
  }

  return (
    <div>
      <EnTete titre="Nouveau relevé" sousTitre="Choisissez le compte, puis importez le fichier de la banque ou saisissez les opérations." />
      <div className="flex flex-col gap-4">
        {erreur && <Alerte>{erreur}</Alerte>}
        <Carte titre="Compte et période">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Liste libelle="Compte" value={journalId} onChange={(e) => setJournalId(e.target.value)} className="lg:col-span-1">
              {tresoreries.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.libelle}
                </option>
              ))}
            </Liste>
            <Champ libelle="Du" type="date" value={debut || lendemain} onChange={(e) => setDebut(e.target.value)} aide="Vide : début des opérations importées" />
            <Champ libelle="Au" type="date" value={fin} onChange={(e) => setFin(e.target.value)} aide="Vide : dernière opération importée" />
            <ChampMontantSigne
              libelle="Solde initial"
              valeur={initial}
              onChange={setSoldeInitial}
              aide={dernier ? `Solde final de ${dernier.numero}` : "Négatif si découvert"}
            />
            <ChampMontantSigne
              libelle="Solde final"
              valeur={soldeFinal ?? 0}
              onChange={setSoldeFinal}
              aide={soldeFinal === null ? "Vide : lu sur le relevé ou calculé" : "Tel qu’indiqué sur le relevé"}
            />
          </div>
        </Carte>

        <Carte titre="Importer le relevé de la banque">
          <ImportReleve envoi={envoi} onImporter={(r) => void creer(r)} />
        </Carte>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          Pas de fichier ?
          <Bouton variante="secondaire" chargement={envoi} onClick={() => void creer()}>
            Créer le relevé et saisir les opérations
          </Bouton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relevé : pointage, état, validation
// ---------------------------------------------------------------------------

function Releve({ releve, version, recharger }: { releve: ReleveBancaire; version: number; recharger: () => void }) {
  const { comptes, journalParId, peutSaisir } = useCompta();
  const router = useRouter();
  const journal = journalParId.get(releve.journal_id);
  const brouillon = releve.statut === "brouillon";
  const modifiable = brouillon && peutSaisir;
  const lignes = releve.lignes_releve ?? [];

  const cle = `${releve.id}|${version}`;
  const [donnees, setDonnees] = useState<{ cle: string; operations: OperationAPointer[]; etat: EtatRapprochement } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; type: "succes" | "info" } | null>(null);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [envoi, setEnvoi] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    Promise.all([chargerOperationsAPointer(supabase, releve.journal_id), chargerEtatRapprochement(supabase, releve.id)])
      .then(([operations, etat]) => actif && setDonnees({ cle, operations, etat }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [releve.id, releve.journal_id, cle]);

  const operations = donnees?.operations ?? [];
  const etat = donnees?.etat ?? null;
  const ligneChoisie = lignes.find((l) => l.id === choisie && !l.ecriture_ligne_id) ?? null;
  const suggestions = ligneChoisie ? suggestionsPointage(ligneChoisie, operations) : [];
  const q = recherche.trim().toLowerCase();
  const exclues = new Set(suggestions.map((s) => s.ecriture_ligne_id));
  const autres = operations
    .filter((o) => !exclues.has(o.ecriture_ligne_id))
    .filter(
      (o) =>
        !q ||
        o.libelle.toLowerCase().includes(q) ||
        (o.numero ?? "").toLowerCase().includes(q) ||
        formaterXOF(Math.abs(o.montant), { symbole: false }).includes(q),
    );

  const pointees = lignes.filter((l) => l.ecriture_ligne_id).length;
  const entrees = lignes.filter((l) => l.montant > 0).reduce((s, l) => s + l.montant, 0);
  const sorties = lignes.filter((l) => l.montant < 0).reduce((s, l) => s - l.montant, 0);
  const calcule = releve.solde_initial + entrees - sorties;
  const equilibre = calcule === releve.solde_final;

  /** Exécute une action ; le texte renvoyé s'affiche (préfixe « ~ » : simple information). */
  async function action(nom: string, fn: () => Promise<string | void>, apres?: () => void) {
    setErreur(null);
    setMessage(null);
    setEnvoi(nom);
    try {
      const m = await fn();
      if (m) setMessage(m.startsWith("~") ? { texte: m.slice(1), type: "info" } : { texte: m, type: "succes" });
      apres?.();
      recharger();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(null);
    }
  }

  const pointer = (ligne: LigneReleve, op: OperationAPointer) =>
    action(`p-${op.ecriture_ligne_id}`, async () => {
      await pointerLigneReleve(supabase, ligne.id, op.ecriture_ligne_id);
    }, () => {
      // Passe à la ligne suivante non pointée
      const suivante = lignes.find((l) => !l.ecriture_ligne_id && l.id !== ligne.id && l.ordre > ligne.ordre);
      setChoisie(suivante?.id ?? null);
    });

  async function valider() {
    if (!window.confirm(`Valider le relevé ${journal?.libelle} du ${formaterDate(releve.date_debut)} au ${formaterDate(releve.date_fin)} ?\n\nUn relevé validé ne peut plus être modifié.`)) return;
    await action("valider", async () => `Relevé ${await validerReleve(supabase, releve.id)} validé.`);
  }

  async function supprimer() {
    if (!window.confirm("Supprimer ce relevé en cours et toutes ses lignes ?")) return;
    setEnvoi("supprimer");
    try {
      await supprimerReleve(supabase, releve.id);
      router.replace("/comptabilite/rapprochement");
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(null);
    }
  }

  return (
    <div>
      <EnTete
        titre={`${releve.numero ?? "Relevé en cours"} · ${journal?.libelle ?? ""}`}
        sousTitre={`Du ${formaterDate(releve.date_debut)} au ${formaterDate(releve.date_fin)} · ${releve.fichier ?? LIBELLES_SOURCES[releve.source]}`}
        action={
          modifiable ? (
            <div className="flex flex-wrap gap-2">
              <Bouton variante="discret" onClick={supprimer} chargement={envoi === "supprimer"}>
                Supprimer
              </Bouton>
              <Bouton
                variante="secondaire"
                chargement={envoi === "auto"}
                disabled={pointees === lignes.length}
                onClick={() =>
                  action("auto", async () => {
                    const n = await rapprocherAutomatiquement(supabase, releve.id);
                    return n ? `${n} opération(s) pointée(s) automatiquement.` : "~Aucune correspondance évidente : pointez à la main.";
                  })
                }
              >
                Rapprochement automatique
              </Bouton>
              <Bouton chargement={envoi === "valider"} disabled={pointees < lignes.length || !equilibre} onClick={valider}>
                Valider le relevé
              </Bouton>
            </div>
          ) : (
            <Bouton variante="secondaire" onClick={() => window.print()}>
              Imprimer
            </Bouton>
          )
        }
      />

      <div className="flex flex-col gap-4">
        {erreur && <Alerte>{erreur}</Alerte>}
        {message && <Alerte type={message.type}>{message.texte}</Alerte>}
        {!brouillon && <Alerte type="succes">Relevé rapproché et validé le {formaterDate((releve.valide_le ?? "").slice(0, 10))} : il ne peut plus être modifié.</Alerte>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicateur libelle="Solde final du relevé" valeur={formaterXOF(releve.solde_final)} detail={`Initial ${formaterXOF(releve.solde_initial)}`} />
          <Indicateur
            libelle="Mouvements du relevé"
            valeur={`${pointees} / ${lignes.length}`}
            detail={`+${formaterXOF(entrees, { symbole: false })} · −${formaterXOF(sorties, { symbole: false })} · pointés`}
            ton={lignes.length > 0 && pointees === lignes.length ? "succes" : "neutre"}
          />
          <Indicateur
            libelle={`Solde comptable au ${formaterDate(releve.date_fin)}`}
            valeur={etat ? formaterXOF(etat.solde_comptable) : "…"}
            detail={etat ? `${etat.nb_ecritures_non_pointees} opération(s) non pointée(s) : ${formaterXOF(etat.ecritures_non_pointees)}` : " "}
          />
          <Indicateur
            libelle="Écart inexpliqué"
            valeur={etat ? formaterXOF(etat.ecart) : "…"}
            detail={
              !etat
                ? " "
                : etat.ecart !== 0
                  ? "Opération manquante ou montant erroné"
                  : etat.nb_releve_non_pointe + etat.nb_ecritures_non_pointees > 0
                    ? `Expliqué par ${etat.nb_releve_non_pointe + etat.nb_ecritures_non_pointees} opération(s) à pointer`
                    : "Le relevé et la comptabilité concordent"
            }
            ton={!etat ? "neutre" : etat.ecart !== 0 ? "attention" : etat.nb_releve_non_pointe + etat.nb_ecritures_non_pointees > 0 ? "neutre" : "succes"}
          />
        </div>

        {!equilibre && (
          <Alerte type="attention">
            Le relevé ne s’équilibre pas : solde initial + mouvements = <strong>{formaterXOF(calcule)}</strong>, mais le solde final indiqué
            est {formaterXOF(releve.solde_final)} (écart {formaterXOF(releve.solde_final - calcule)}). Vérifiez les soldes ou les opérations
            importées.
          </Alerte>
        )}

        {modifiable && <EnTeteReleve releve={releve} onEnregistre={recharger} />}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Carte titre="Relevé de la banque" action={<span className="text-xs text-muted">{lignes.length} opération(s)</span>}>
            {lignes.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Aucune opération : importez le fichier ou ajoutez les lignes ci-dessous.</p>
            ) : (
              <div className="-m-5 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="border-b border-border bg-surface-retrait text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Date</th>
                      <th className="px-2 py-2.5 font-medium">Libellé</th>
                      <th className="px-2 py-2.5 text-right font-medium">Montant</th>
                      <th className="px-5 py-2.5 font-medium">Pointage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => {
                      const selection = l.id === ligneChoisie?.id;
                      const op = l.ecriture_lignes?.ecritures;
                      return (
                        <tr
                          key={l.id}
                          className={`border-b border-border last:border-0 ${selection ? "bg-primary-soft" : ""} ${
                            modifiable && !l.ecriture_ligne_id ? "cursor-pointer hover:bg-surface-retrait" : ""
                          }`}
                          onClick={() => modifiable && !l.ecriture_ligne_id && setChoisie(selection ? null : l.id)}
                        >
                          <td className="px-5 py-2.5 whitespace-nowrap">{formaterDate(l.date_operation)}</td>
                          <td className="px-2 py-2.5">
                            <p className="line-clamp-2">{l.libelle}</p>
                            {l.reference && <p className="text-xs text-muted">{l.reference}</p>}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <MontantSigne valeur={l.montant} />
                          </td>
                          <td className="px-5 py-2.5">
                            {l.ecriture_ligne_id ? (
                              <div className="flex items-center gap-2">
                                <Badge ton="vert">✓ {op?.numero ?? "Pointée"}</Badge>
                                {modifiable && (
                                  <button
                                    type="button"
                                    className="text-xs text-muted hover:text-danger"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void action(`d-${l.id}`, () => depointerLigneReleve(supabase, l.id));
                                    }}
                                  >
                                    Dépointer
                                  </button>
                                )}
                              </div>
                            ) : modifiable ? (
                              <div className="flex items-center gap-2">
                                <Badge ton={selection ? "vert" : "orange"}>{selection ? "Choisir à droite →" : "À pointer"}</Badge>
                                <button
                                  type="button"
                                  aria-label={`Supprimer la ligne ${l.libelle}`}
                                  className="text-xs text-muted hover:text-danger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Supprimer la ligne « ${l.libelle} » ?`)) {
                                      void action(`s-${l.id}`, () => supprimerLigneReleve(supabase, l.id));
                                    }
                                  }}
                                >
                                  Supprimer
                                </button>
                              </div>
                            ) : (
                              <Badge ton="orange">Non pointée</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Carte>

          {modifiable && (
            <Carte titre={ligneChoisie ? "Pointer l’opération" : "Comptabilité non pointée"}>
              {!donnees ? (
                <Chargement />
              ) : ligneChoisie ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl bg-primary-soft px-4 py-3 text-sm">
                    <p className="font-medium">{ligneChoisie.libelle}</p>
                    <p className="mt-0.5 text-muted">
                      {formaterDate(ligneChoisie.date_operation)} · <MontantSigne valeur={ligneChoisie.montant} />
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Même montant en comptabilité</p>
                    {suggestions.length === 0 ? (
                      <p className="text-sm text-muted">Aucune opération de ce montant n’est en attente.</p>
                    ) : (
                      <ListeOperations operations={suggestions} envoi={envoi} onPointer={(op) => pointer(ligneChoisie, op)} />
                    )}
                  </div>

                  <Comptabiliser
                    key={ligneChoisie.id}
                    ligne={ligneChoisie}
                    comptes={comptes.filter((c) => c.actif && c.mouvementable && c.id !== journal?.compte_tresorerie_id)}
                    envoi={envoi === "comptabiliser"}
                    onValider={(compteId, libelle) =>
                      action("comptabiliser", async () => {
                        await comptabiliserLigneReleve(supabase, ligneChoisie.id, compteId, libelle);
                        return "Écriture créée et pointée.";
                      })
                    }
                  />

                  {autres.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-sm text-muted hover:text-foreground">
                        Autres opérations ({autres.length}) : montant différent
                      </summary>
                      <p className="mt-2 text-xs text-muted">
                        Un pointage exige le même montant. Si la banque a regroupé plusieurs opérations, saisissez le détail sur le relevé.
                      </p>
                    </details>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted">
                    Cliquez sur une ligne du relevé « à pointer » pour la relier à une opération comptable, ou pour comptabiliser des frais.
                  </p>
                  <input
                    className="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                    placeholder="Rechercher (libellé, n°, montant)…"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                  />
                  {operations.length === 0 ? (
                    <p className="text-sm text-muted">Toutes les opérations comptables de ce compte sont pointées.</p>
                  ) : (
                    <ListeOperations operations={autres.slice(0, 40)} />
                  )}
                </div>
              )}
            </Carte>
          )}
        </div>

        {modifiable && <AjoutLignes releve={releve} onAjoute={recharger} />}
      </div>
    </div>
  );
}

function ListeOperations({
  operations,
  envoi,
  onPointer,
}: {
  operations: OperationAPointer[];
  envoi?: string | null;
  onPointer?: (op: OperationAPointer) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {operations.map((o) => (
        <li key={o.ecriture_ligne_id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate">{o.libelle}</p>
            <p className="text-xs text-muted">
              {formaterDate(o.date_ecriture)} · {o.numero}
              {o.reference ? ` · ${o.reference}` : ""}
            </p>
          </div>
          <MontantSigne valeur={o.montant} />
          {onPointer && (
            <Bouton className="h-8 px-3" chargement={envoi === `p-${o.ecriture_ligne_id}`} onClick={() => onPointer(o)}>
              Pointer
            </Bouton>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Opération connue seulement de la banque : on choisit le compte, l'écriture est créée et pointée. */
function Comptabiliser({
  ligne,
  comptes,
  envoi,
  onValider,
}: {
  ligne: LigneReleve;
  comptes: Parameters<typeof ChoixCompte>[0]["comptes"];
  envoi: boolean;
  onValider: (compteId: string, libelle: string) => void;
}) {
  // Frais bancaires (631) proposés par défaut pour une sortie
  const [compteId, setCompteId] = useState(() => (ligne.montant < 0 ? (comptes.find((c) => c.numero === "631")?.id ?? "") : ""));
  const [libelle, setLibelle] = useState(ligne.libelle);
  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <p className="text-sm font-medium">Absente de la comptabilité ?</p>
      <p className="mb-3 text-xs text-muted">
        Frais, agios, virement reçu non saisi… L’écriture est passée au journal {ligne.montant < 0 ? "en dépense" : "en recette"}, datée du{" "}
        {formaterDate(ligne.date_operation)}, puis pointée.
      </p>
      <div className="flex flex-col gap-2">
        <ChoixCompte comptes={comptes} valeur={compteId} onChange={setCompteId} ariaLabel="Compte de contrepartie" placeholder="Compte : 631 frais bancaires, 6xx, 7xx…" />
        <input
          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          value={libelle}
          aria-label="Libellé de l'écriture"
          onChange={(e) => setLibelle(e.target.value)}
        />
        <Bouton variante="secondaire" disabled={!compteId} chargement={envoi} onClick={() => onValider(compteId, libelle)}>
          Comptabiliser et pointer
        </Bouton>
      </div>
    </div>
  );
}

function EnTeteReleve({ releve, onEnregistre }: { releve: ReleveBancaire; onEnregistre: () => void }) {
  const [debut, setDebut] = useState(releve.date_debut);
  const [fin, setFin] = useState(releve.date_fin);
  const [initial, setInitial] = useState(releve.solde_initial);
  const [final, setFinal] = useState(releve.solde_final);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function enregistrer() {
    setErreur(null);
    setEnvoi(true);
    try {
      await enregistrerReleve(supabase, {
        entrepriseId: releve.entreprise_id,
        journalId: releve.journal_id,
        dateDebut: debut,
        dateFin: fin,
        soldeInitial: initial,
        soldeFinal: final,
        notes: releve.notes,
        releveId: releve.id,
      });
      onEnregistre();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <details className="rounded-2xl border border-border bg-surface px-5 py-3 shadow-carte">
      <summary className="cursor-pointer text-sm font-medium">Période et soldes du relevé</summary>
      <div className="mt-4 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Champ libelle="Du" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
        <Champ libelle="Au" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
        <ChampMontantSigne libelle="Solde initial" valeur={initial} onChange={setInitial} />
        <ChampMontantSigne libelle="Solde final" valeur={final} onChange={setFinal} />
        <Bouton variante="secondaire" chargement={envoi} onClick={enregistrer}>
          Enregistrer
        </Bouton>
      </div>
      {erreur && <div className="mt-3"><Alerte>{erreur}</Alerte></div>}
    </details>
  );
}

function AjoutLignes({ releve, onAjoute }: { releve: ReleveBancaire; onAjoute: () => void }) {
  const [date, setDate] = useState(releve.date_fin);
  const [libelle, setLibelle] = useState("");
  const [sens, setSens] = useState<"sortie" | "entree">("sortie");
  const [montant, setMontant] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function ajouter(lignes: LigneImport[], source?: SourceReleve, fichier?: string) {
    setErreur(null);
    setEnvoi(true);
    try {
      await enregistrerReleve(supabase, {
        entrepriseId: releve.entreprise_id,
        journalId: releve.journal_id,
        dateDebut: releve.date_debut,
        dateFin: releve.date_fin,
        soldeInitial: releve.solde_initial,
        soldeFinal: releve.solde_final,
        notes: releve.notes,
        releveId: releve.id,
        lignes,
        source,
        fichier,
      });
      setLibelle("");
      setMontant(0);
      onAjoute();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Carte titre="Ajouter des opérations">
      <div className="flex flex-col gap-5">
        {erreur && <Alerte>{erreur}</Alerte>}
        <form
          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_minmax(0,1fr)_9rem_10rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!libelle.trim() || montant <= 0) return setErreur("Indiquez un libellé et un montant.");
            void ajouter([{ date, libelle: libelle.trim(), montant: sens === "sortie" ? -montant : montant }]);
          }}
        >
          <Champ libelle="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Champ libelle="Libellé" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex. : FRAIS TENUE DE COMPTE" />
          <Liste libelle="Sens" value={sens} onChange={(e) => setSens(e.target.value as "sortie" | "entree")}>
            <option value="sortie">Sortie (débit)</option>
            <option value="entree">Entrée (crédit)</option>
          </Liste>
          <ChampMontantSigne libelle="Montant" valeur={montant} onChange={(v) => setMontant(Math.abs(v))} />
          <Bouton type="submit" variante="secondaire" chargement={envoi}>
            Ajouter
          </Bouton>
        </form>
        <details>
          <summary className="cursor-pointer text-sm text-muted hover:text-foreground">Importer d’autres lignes depuis un fichier</summary>
          <div className="mt-4">
            <ImportReleve envoi={envoi} onImporter={(r) => void ajouter(r.lignes, r.source, r.fichier)} />
          </div>
        </details>
      </div>
    </Carte>
  );
}
