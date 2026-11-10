"use client";

import {
  annulerDevis,
  aujourdhui,
  calculerLigne,
  chargerDocument,
  chargerEntreprise,
  chargerReglements,
  creerAvoir,
  enregistrerDocument,
  enregistrerReglement,
  formaterDate,
  formaterXOF,
  LIBELLES_MODES_REGLEMENT,
  LIBELLES_TYPES_DOCUMENT,
  resteAPayer,
  supprimerDocument,
  totauxDocument,
  transformerDevis,
  validerDocument,
  type Article,
  type DocumentVente,
  type Entreprise,
  type LigneSaisieVente,
  type ModeReglement,
  type Reglement,
} from "@facturall/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChampMontant } from "@/components/compta";
import { Alerte, Bouton, Carte, Champ, Chargement, LienBouton, Liste } from "@/components/ui";
import { BadgeEtat, ChoixClient, DocumentImprimable } from "@/components/ventes";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";
import { useVentes } from "@/lib/ventes";

export default function PageDocument() {
  return (
    <Suspense fallback={<Chargement />}>
      <Document />
    </Suspense>
  );
}

function Document() {
  const params = useSearchParams();
  const id = params.get("id");
  const typeNouveau = params.get("type") === "devis" ? "devis" : "facture";
  const { peutVendre } = useVentes();
  const [document, setDocument] = useState<DocumentVente | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!id) return;
    chargerDocument(supabase, id).then(setDocument, (e: Error) => setErreur(e.message));
  }, [id, version]);

  if (erreur) return <Alerte>{erreur}</Alerte>;
  const recharger = () => setVersion((v) => v + 1);
  if (!id) return peutVendre ? <Editeur key="nouveau" type={typeNouveau} onEnregistre={recharger} /> : <Alerte>Droits insuffisants.</Alerte>;
  if (!document || document.id !== id) return <Chargement />;
  if (document.statut === "brouillon" && peutVendre && document.type !== "avoir") {
    return <Editeur key={document.id + version} type={document.type as "devis" | "facture"} brouillon={document} onEnregistre={recharger} />;
  }
  return <Consultation document={document} recharger={recharger} />;
}

// ===========================================================================
// Saisie d'un devis ou d'une facture (brouillon)
// ===========================================================================

type Ligne = LigneSaisieVente & { cle: number };
let compteur = 0;
const ligneVide = (): Ligne => ({
  cle: ++compteur,
  article_id: null,
  designation: "",
  quantite: 1,
  unite: null,
  prix_unitaire: 0,
  remise_pct: 0,
  taux_tva_id: null,
});

function Editeur({
  type,
  brouillon,
  onEnregistre,
}: {
  type: "devis" | "facture";
  brouillon?: DocumentVente;
  onEnregistre: () => void;
}) {
  const router = useRouter();
  const { entreprise, boutique, boutiques } = useEspace();
  const ventes = useVentes();
  const { clients, articles, taux, tauxDefaut, tauxParId, articleParId, tresoreries } = ventes;

  const [clientId, setClientId] = useState(brouillon?.client_id ?? clients.find((c) => c.code === "CL0000")?.id ?? "");
  const [boutiqueId, setBoutiqueId] = useState(brouillon?.boutique_id ?? boutique?.id ?? "");
  const [date, setDate] = useState(brouillon?.date_document ?? aujourdhui());
  const [echeance, setEcheance] = useState(brouillon?.date_echeance ?? "");
  const [referenceClient, setReferenceClient] = useState(brouillon?.reference_client ?? "");
  const [notes, setNotes] = useState(brouillon?.notes ?? "");
  const [lignes, setLignes] = useState<Ligne[]>(() =>
    brouillon?.lignes_documents_vente?.length
      ? brouillon.lignes_documents_vente.map((l) => ({
          cle: ++compteur,
          article_id: l.article_id,
          designation: l.designation,
          quantite: l.quantite,
          unite: l.unite,
          prix_unitaire: l.prix_unitaire,
          remise_pct: l.remise_pct,
          taux_tva_id: l.taux_tva_id,
        }))
      : [ligneVide()],
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<"brouillon" | "valider" | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [encaisser, setEncaisser] = useState(true);
  // null = montant total TTC ; sinon acompte saisi
  const [montantRecu, setMontantRecu] = useState<number | null>(null);
  const [referenceReglement, setReferenceReglement] = useState("");
  const [journalId, setJournalId] = useState(tresoreries.find((j) => j.type === "caisse")?.id ?? "");
  const [mode, setMode] = useState<ModeReglement>("especes");

  const totaux = totauxDocument(lignes, tauxParId, tauxDefaut, articleParId);
  const montantEncaisse = montantRecu ?? totaux.ttc;
  const boutiquesActives = boutiques.filter((b) => b.active);
  const articlesActifs = articles.filter((a) => a.actif);
  const tauxActifs = taux.filter((t) => t.actif);

  if (!entreprise) return null;

  const maj = (cle: number, champs: Partial<Ligne>) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...champs } : l)));

  function choisirArticle(cle: number, a: Article) {
    maj(cle, { article_id: a.id, designation: a.designation, prix_unitaire: a.prix_vente, unite: a.unite, taux_tva_id: a.taux_tva_id });
  }

  function verifier(): string | null {
    if (!clientId) return "Choisissez un client.";
    if (!boutiqueId) return "Choisissez la boutique.";
    const utiles = lignes.filter((l) => l.designation.trim() || l.article_id);
    if (utiles.length === 0) return "Ajoutez au moins une ligne.";
    for (const [i, l] of utiles.entries()) {
      if (!l.designation.trim()) return `Ligne ${i + 1} : désignation manquante.`;
      if (!(l.quantite > 0)) return `Ligne ${i + 1} : quantité invalide.`;
    }
    return null;
  }

  async function enregistrer(valider: boolean) {
    if (!entreprise) return;
    const invalide = verifier();
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEnvoi(valider ? "valider" : "brouillon");
    try {
      const id = await enregistrerDocument(supabase, {
        entrepriseId: entreprise.entreprise_id,
        type,
        boutiqueId,
        clientId,
        date,
        dateEcheance: echeance || null,
        referenceClient: referenceClient.trim() || null,
        notes: notes.trim() || null,
        lignes: lignes.filter((l) => l.designation.trim() || l.article_id),
        documentId: brouillon?.id ?? null,
      });
      if (valider) {
        await validerDocument(
          supabase,
          id,
          type === "facture" && encaisser && journalId && montantEncaisse > 0
            ? { montant: montantEncaisse, journal_id: journalId, mode, reference: referenceReglement.trim() || null }
            : null,
        );
      }
      if (brouillon) onEnregistre();
      else router.replace(`/ventes/document?id=${id}`);
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(null);
      setConfirmation(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/ventes" className="text-sm text-muted hover:text-foreground">← Ventes</Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {brouillon ? `${LIBELLES_TYPES_DOCUMENT[type]} brouillon` : type === "devis" ? "Nouveau devis" : "Nouvelle facture"}
        </h1>
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}

      <Carte>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium">Client <span className="text-danger">*</span></span>
            <ChoixClient
              entrepriseId={entreprise.entreprise_id}
              clients={clients}
              valeur={clientId}
              onChange={setClientId}
              onCree={() => void ventes.rafraichir()}
            />
          </div>
          <Champ libelle="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Champ
            libelle={type === "devis" ? "Valable jusqu'au" : "Échéance"}
            type="date"
            value={echeance}
            min={date}
            onChange={(e) => setEcheance(e.target.value)}
            aide={echeance ? undefined : type === "facture" ? "Par défaut : délai du client ou 30 jours" : "Par défaut : 30 jours"}
          />
          {boutiquesActives.length > 1 && (
            <Liste libelle="Boutique" value={boutiqueId} onChange={(e) => setBoutiqueId(e.target.value)}>
              {boutiquesActives.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </Liste>
          )}
          <Champ libelle="Référence du client (bon de commande…)" value={referenceClient} onChange={(e) => setReferenceClient(e.target.value)} />
        </div>
      </Carte>

      <Carte titre="Lignes">
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Article / désignation</th>
                <th className="w-24 pb-2 pl-2 text-right font-medium">Qté</th>
                <th className="w-32 pb-2 pl-2 text-right font-medium">P.U. HT</th>
                <th className="w-20 pb-2 pl-2 text-right font-medium">Remise %</th>
                <th className="w-36 pb-2 pl-2 font-medium">TVA</th>
                <th className="w-28 pb-2 pl-2 text-right font-medium">Montant HT</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const tauxLigne = tauxParId.get(l.taux_tva_id ?? (l.article_id ? articleParId.get(l.article_id)?.taux_tva_id ?? "" : "") ?? "") ?? tauxDefaut;
                const m = calculerLigne(l.quantite || 0, l.prix_unitaire || 0, l.remise_pct || 0, tauxLigne?.taux ?? 0);
                return (
                  <tr key={l.cle} className="align-top">
                    <td className="py-1">
                      <ChoixArticle
                        articles={articlesActifs}
                        designation={l.designation}
                        onDesignation={(t) => maj(l.cle, { designation: t, article_id: null })}
                        onArticle={(a) => choisirArticle(l.cle, a)}
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <input
                        aria-label="Quantité"
                        inputMode="decimal"
                        className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-right text-sm outline-none focus:border-primary"
                        defaultValue={String(l.quantite).replace(".", ",")}
                        onChange={(e) => maj(l.cle, { quantite: Number(e.target.value.replace(",", ".").replace(/\s/g, "")) || 0 })}
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <ChampMontant ariaLabel="Prix unitaire HT" valeur={l.prix_unitaire} onChange={(v) => maj(l.cle, { prix_unitaire: v })} />
                    </td>
                    <td className="py-1 pl-2">
                      <input
                        aria-label="Remise %"
                        inputMode="decimal"
                        className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-right text-sm outline-none focus:border-primary"
                        defaultValue={l.remise_pct ? String(l.remise_pct).replace(".", ",") : ""}
                        placeholder="0"
                        onChange={(e) => maj(l.cle, { remise_pct: Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)) })}
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <Liste
                        aria-label="Taux de TVA"
                        value={tauxLigne?.id ?? ""}
                        onChange={(e) => maj(l.cle, { taux_tva_id: e.target.value })}
                      >
                        {tauxActifs.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
                      </Liste>
                    </td>
                    <td className="montant py-1 pl-2 pt-3 text-right font-medium">{formaterXOF(m.ht, { symbole: false })}</td>
                    <td className="py-1 pl-1">
                      <button
                        type="button"
                        aria-label="Supprimer la ligne"
                        disabled={lignes.length <= 1}
                        onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))}
                        className="grid size-10 place-items-center rounded-lg text-muted hover:bg-background hover:text-danger disabled:opacity-30"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-6">
          <Bouton type="button" variante="secondaire" className="h-9" onClick={() => setLignes((ls) => [...ls, ligneVide()])}>
            + Ajouter une ligne
          </Bouton>
          <table className="min-w-64 text-sm">
            <tbody>
              <tr><td className="py-0.5 pr-8 text-muted">Total HT</td><td className="montant text-right">{formaterXOF(totaux.ht)}</td></tr>
              <tr><td className="py-0.5 pr-8 text-muted">TVA</td><td className="montant text-right">{formaterXOF(totaux.tva)}</td></tr>
              <tr className="border-t border-border text-base font-semibold">
                <td className="pt-1.5 pr-8">Total TTC</td><td className="montant pt-1.5 text-right">{formaterXOF(totaux.ttc)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Carte>

      <Carte titre="Notes (imprimées sur le document)">
        <textarea
          aria-label="Notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex. : conditions de livraison, garantie…"
          className="w-full rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
        />
      </Carte>

      {confirmation && type === "facture" ? (
        <Carte titre="Valider la facture">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              La facture recevra son numéro définitif et ne pourra plus être modifiée (seulement annulée par un avoir). L&apos;écriture
              de vente est passée en comptabilité.
            </p>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="accent-primary" checked={encaisser} onChange={(e) => setEncaisser(e.target.checked)} />
              Le client paie maintenant (en tout ou en partie)
            </label>
            {encaisser && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <ChampMontant
                    libelle={`Montant reçu (total : ${formaterXOF(totaux.ttc)})`}
                    valeur={montantEncaisse}
                    onChange={(v) => setMontantRecu(v)}
                  />
                  {montantEncaisse > totaux.ttc ? (
                    <span className="text-xs text-danger">Supérieur au total de la facture.</span>
                  ) : montantEncaisse > 0 && montantEncaisse < totaux.ttc ? (
                    <span className="text-xs text-muted">Acompte : il restera {formaterXOF(totaux.ttc - montantEncaisse)} à payer.</span>
                  ) : null}
                </div>
                <Champ
                  libelle="Référence (n° transaction…)"
                  value={referenceReglement}
                  onChange={(e) => setReferenceReglement(e.target.value)}
                />
                <Liste libelle="Encaissé sur" value={journalId} onChange={(e) => setJournalId(e.target.value)}>
                  {tresoreries.map((j) => <option key={j.id} value={j.id}>{j.libelle}</option>)}
                </Liste>
                <Liste libelle="Mode de paiement" value={mode} onChange={(e) => setMode(e.target.value as ModeReglement)}>
                  {(Object.keys(LIBELLES_MODES_REGLEMENT) as ModeReglement[]).map((m) => (
                    <option key={m} value={m}>{LIBELLES_MODES_REGLEMENT[m]}</option>
                  ))}
                </Liste>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Bouton variante="secondaire" onClick={() => setConfirmation(false)}>Retour</Bouton>
              <Bouton
                chargement={envoi === "valider"}
                disabled={encaisser && (montantEncaisse <= 0 || montantEncaisse > totaux.ttc)}
                onClick={() => void enregistrer(true)}
              >
                Valider{encaisser ? " et encaisser" : ""}
              </Bouton>
            </div>
          </div>
        </Carte>
      ) : (
        <div className="flex flex-wrap justify-end gap-3">
          <Bouton variante="secondaire" chargement={envoi === "brouillon"} onClick={() => void enregistrer(false)}>
            Enregistrer en brouillon
          </Bouton>
          <Bouton
            disabled={totaux.ttc <= 0 && type === "facture"}
            chargement={envoi === "valider"}
            onClick={() => {
              const invalide = verifier();
              if (invalide) return setErreur(invalide);
              setErreur(null);
              if (type === "facture") setConfirmation(true);
              else void enregistrer(true);
            }}
          >
            {type === "facture" ? "Valider la facture…" : "Valider le devis"}
          </Bouton>
        </div>
      )}
    </div>
  );
}

/** Désignation libre ou choix d'un article du catalogue */
function ChoixArticle({
  articles,
  designation,
  onDesignation,
  onArticle,
}: {
  articles: Article[];
  designation: string;
  onDesignation: (t: string) => void;
  onArticle: (a: Article) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const resultats = useMemo(() => {
    const q = designation.trim().toLowerCase();
    return articles
      .filter((a) => !q || a.designation.toLowerCase().includes(q) || (a.reference ?? "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [articles, designation]);

  return (
    <div ref={conteneur} className="relative" onBlur={(e) => !conteneur.current?.contains(e.relatedTarget as Node) && setOuvert(false)}>
      <input
        aria-label="Désignation"
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        placeholder="Article ou désignation libre…"
        value={designation}
        onFocus={() => setOuvert(true)}
        onChange={(e) => {
          onDesignation(e.target.value);
          setOuvert(true);
        }}
      />
      {ouvert && resultats.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full min-w-80 overflow-auto rounded-lg border border-border bg-surface py-1 text-sm shadow-lg">
          {resultats.map((a) => (
            <li
              key={a.id}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onArticle(a);
                setOuvert(false);
              }}
              className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-primary-soft"
            >
              <span className="truncate">{a.designation}</span>
              <span className="montant ml-auto shrink-0 text-xs text-muted">{formaterXOF(a.prix_vente)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===========================================================================
// Consultation d'un document validé
// ===========================================================================

function Consultation({ document: d, recharger }: { document: DocumentVente; recharger: () => void }) {
  const router = useRouter();
  const { entreprise, boutiques } = useEspace();
  const { clientParId, parametres, tresoreries, peutVendre, peutFaireAvoir } = useVentes();
  const [infos, setInfos] = useState<Entreprise | null>(null);
  const [reglements, setReglements] = useState<Reglement[]>([]);
  const [origine, setOrigine] = useState<DocumentVente | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [panneau, setPanneau] = useState<"reglement" | "avoir" | null>(null);

  const charger = useCallback(async () => {
    if (!entreprise) return;
    try {
      const [e, r, o] = await Promise.all([
        chargerEntreprise(supabase, entreprise.entreprise_id),
        d.type === "facture" ? chargerReglements(supabase, d.id) : Promise.resolve([]),
        d.document_origine_id ? chargerDocument(supabase, d.document_origine_id) : Promise.resolve(null),
      ]);
      setInfos(e);
      setReglements(r);
      setOrigine(o);
    } catch (err) {
      setErreur((err as Error).message);
    }
  }, [entreprise, d]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  async function agir(fn: () => Promise<unknown>, succes?: string) {
    setErreur(null);
    setMessage(null);
    try {
      await fn();
      if (succes) setMessage(succes);
      setPanneau(null);
      recharger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  const reste = resteAPayer(d);
  const brouillonLecture = d.statut === "brouillon";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/ventes" className="text-sm text-muted hover:text-foreground">← Ventes</Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {LIBELLES_TYPES_DOCUMENT[d.type]} {d.numero ?? "brouillon"}
        </h1>
        <BadgeEtat document={d} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Bouton variante="secondaire" onClick={() => window.print()}>Imprimer / PDF</Bouton>
          {peutVendre && d.type === "facture" && d.statut === "valide" && reste > 0 && (
            <Bouton onClick={() => setPanneau("reglement")}>Enregistrer un règlement</Bouton>
          )}
          {peutVendre && d.type === "devis" && d.statut === "valide" && (
            <>
              <Bouton variante="secondaire" onClick={() => {
                if (confirm("Annuler ce devis ?")) void agir(() => annulerDevis(supabase, d.id), "Devis annulé.");
              }}>Annuler le devis</Bouton>
              <Bouton onClick={() => void agir(async () => {
                const id = await transformerDevis(supabase, d.id);
                router.push(`/ventes/document?id=${id}`);
              })}>Transformer en facture</Bouton>
            </>
          )}
          {peutFaireAvoir && d.type === "facture" && d.statut === "valide" && d.montant_regle === 0 && d.montant_avoir === 0 && (
            <Bouton variante="danger" onClick={() => setPanneau("avoir")}>Annuler par un avoir</Bouton>
          )}
          {peutVendre && brouillonLecture && (
            <Bouton variante="danger" onClick={() => {
              if (confirm("Supprimer ce brouillon ?")) void agir(async () => { await supprimerDocument(supabase, d.id); router.push("/ventes"); });
            }}>Supprimer</Bouton>
          )}
        </div>
      </div>

      <div className="print:hidden">
        {erreur && <Alerte>{erreur}</Alerte>}
        {message && <Alerte type="succes">{message}</Alerte>}
      </div>

      {panneau === "reglement" && (
        <PanneauReglement
          reste={reste}
          tresoreries={tresoreries}
          onAnnuler={() => setPanneau(null)}
          onValider={(r) => agir(() => enregistrerReglement(supabase, d.id, r), `Règlement de ${formaterXOF(r.montant)} enregistré.`)}
        />
      )}
      {panneau === "avoir" && (
        <PanneauAvoir
          numero={d.numero ?? ""}
          onAnnuler={() => setPanneau(null)}
          onValider={(motif) => agir(async () => {
            const id = await creerAvoir(supabase, d.id, motif);
            router.push(`/ventes/document?id=${id}`);
          })}
        />
      )}

      {d.type === "facture" && d.statut === "valide" && (
        <div className="grid gap-3 sm:grid-cols-3 print:hidden">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">Total TTC</p>
            <p className="montant mt-1 text-lg font-semibold">{formaterXOF(d.total_ttc)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">Réglé{d.montant_avoir ? " / avoir" : ""}</p>
            <p className="montant mt-1 text-lg font-semibold">{formaterXOF(d.montant_regle + d.montant_avoir)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">Reste à payer</p>
            <p className={`montant mt-1 text-lg font-semibold ${reste > 0 ? "" : "text-primary"}`}>{formaterXOF(reste)}</p>
            {d.date_echeance && reste > 0 && <p className="text-xs text-muted">Échéance : {formaterDate(d.date_echeance)}</p>}
          </div>
        </div>
      )}

      {reglements.length > 0 && (
        <Carte titre="Règlements" className="print:hidden">
          <ul className="-my-2 divide-y divide-border text-sm">
            {reglements.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-3 py-2">
                <span>{formaterDate(r.date_reglement)}</span>
                <span className="text-muted">
                  {[LIBELLES_MODES_REGLEMENT[r.mode], tresoreries.find((j) => j.id === r.journal_id)?.libelle, r.reference]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="montant ml-auto font-medium">{formaterXOF(r.montant)}</span>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      {origine && (
        <p className="text-sm text-muted print:hidden">
          {d.type === "avoir" ? "Avoir sur la facture " : "Établie d'après le devis "}
          <Link href={`/ventes/document?id=${origine.id}`} className="text-primary hover:underline">{origine.numero}</Link>
        </p>
      )}

      {infos ? (
        <div className="rounded-xl border border-border bg-background p-2 sm:p-6 print:border-0 print:bg-white print:p-0">
          <DocumentImprimable
            document={d}
            entreprise={infos}
            boutique={boutiques.find((b) => b.id === d.boutique_id)}
            client={clientParId.get(d.client_id)}
            mentions={parametres?.mentions_facture ?? null}
            numeroOrigine={origine?.numero}
          />
        </div>
      ) : (
        <Chargement />
      )}
      {d.type === "facture" && d.statut === "valide" && (
        <p className="text-xs text-muted print:hidden">
          Écriture comptable générée automatiquement au journal des ventes.{" "}
          <LienBouton href="/comptabilite" variante="discret" className="h-auto px-0 text-xs">Voir la comptabilité</LienBouton>
        </p>
      )}
    </div>
  );
}

function PanneauReglement({
  reste,
  tresoreries,
  onAnnuler,
  onValider,
}: {
  reste: number;
  tresoreries: { id: string; libelle: string; type: string }[];
  onAnnuler: () => void;
  onValider: (r: { montant: number; journalId: string; mode: ModeReglement; date: string; reference: string | null }) => Promise<void>;
}) {
  const [montant, setMontant] = useState(reste);
  const [journalId, setJournalId] = useState(tresoreries.find((j) => j.type === "caisse")?.id ?? tresoreries[0]?.id ?? "");
  const [mode, setMode] = useState<ModeReglement>("especes");
  const [date, setDate] = useState(aujourdhui());
  const [reference, setReference] = useState("");
  const [envoi, setEnvoi] = useState(false);

  return (
    <Carte titre="Enregistrer un règlement" className="print:hidden">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <ChampMontant libelle={`Montant (reste : ${formaterXOF(reste)})`} valeur={montant} onChange={setMontant} />
        <Champ libelle="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Liste libelle="Encaissé sur" value={journalId} onChange={(e) => {
          setJournalId(e.target.value);
          const t = tresoreries.find((j) => j.id === e.target.value)?.type;
          setMode(t === "monnaie_electronique" ? "mobile_money" : t === "banque" ? "virement" : "especes");
        }}>
          {tresoreries.map((j) => <option key={j.id} value={j.id}>{j.libelle}</option>)}
        </Liste>
        <Liste libelle="Mode" value={mode} onChange={(e) => setMode(e.target.value as ModeReglement)}>
          {(Object.keys(LIBELLES_MODES_REGLEMENT) as ModeReglement[]).map((m) => <option key={m} value={m}>{LIBELLES_MODES_REGLEMENT[m]}</option>)}
        </Liste>
        <Champ libelle="Référence (n° transaction…)" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div className="mt-4 flex justify-end gap-3">
        <Bouton variante="secondaire" onClick={onAnnuler}>Annuler</Bouton>
        <Bouton
          chargement={envoi}
          disabled={montant <= 0 || montant > reste || !journalId}
          onClick={async () => {
            setEnvoi(true);
            await onValider({ montant, journalId, mode, date, reference: reference.trim() || null });
            setEnvoi(false);
          }}
        >
          Enregistrer
        </Bouton>
      </div>
    </Carte>
  );
}

function PanneauAvoir({ numero, onAnnuler, onValider }: { numero: string; onAnnuler: () => void; onValider: (motif: string) => Promise<void> }) {
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  return (
    <Carte titre={`Annuler la facture ${numero} par un avoir`} className="print:hidden">
      <p className="mb-4 text-sm text-muted">
        Un avoir du même montant est établi et numéroté ; l&apos;écriture inverse est passée en comptabilité. La facture reste
        dans l&apos;historique.
      </p>
      <Champ libelle="Motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : marchandise retournée, erreur de facturation…" required />
      <div className="mt-4 flex justify-end gap-3">
        <Bouton variante="secondaire" onClick={onAnnuler}>Retour</Bouton>
        <Bouton
          variante="danger"
          chargement={envoi}
          disabled={!motif.trim()}
          onClick={async () => {
            setEnvoi(true);
            await onValider(motif.trim());
            setEnvoi(false);
          }}
        >
          Établir l&apos;avoir
        </Bouton>
      </div>
    </Carte>
  );
}
