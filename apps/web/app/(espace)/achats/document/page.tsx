"use client";

import {
  aujourdhui,
  calculerLigne,
  chargerDocumentAchat,
  chargerPaiementsFournisseur,
  creerAvoirAchat,
  enregistrerDocumentAchat,
  enregistrerPaiementFournisseur,
  formaterDate,
  formaterQuantite,
  formaterXOF,
  LIBELLES_MODES_REGLEMENT,
  resteAPayerAchat,
  supprimerDocumentAchat,
  totauxAchat,
  validerDocumentAchat,
  type Article,
  type DocumentAchat,
  type Journal,
  type LigneSaisieAchat,
  type ModeReglement,
  type PaiementFournisseur,
} from "@facturall/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { BadgeEtatAchat, ChoixFournisseur } from "@/components/achats";
import { ChampMontant, ChoixCompte } from "@/components/compta";
import { Alerte, Bouton, Carte, Champ, Chargement, LienBouton, Liste } from "@/components/ui";
import { useAchats } from "@/lib/achats";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

export default function PageDocumentAchat() {
  return (
    <Suspense fallback={<Chargement />}>
      <Document />
    </Suspense>
  );
}

function Document() {
  const params = useSearchParams();
  const id = params.get("id");
  const { peutAcheter } = useAchats();
  const [resultat, setResultat] = useState<{ cle: string; document: DocumentAchat } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const cle = `${id}|${version}`;
  useEffect(() => {
    if (!id) return;
    let actif = true;
    chargerDocumentAchat(supabase, id).then(
      (document) => actif && setResultat({ cle, document }),
      (e: Error) => actif && setErreur(e.message),
    );
    return () => {
      actif = false;
    };
  }, [id, cle]);

  if (erreur) return <Alerte>{erreur}</Alerte>;
  const recharger = () => setVersion((v) => v + 1);
  if (!id) return peutAcheter ? <Editeur key="nouveau" onEnregistre={recharger} /> : <Alerte>Droits insuffisants.</Alerte>;
  const document = resultat?.document.id === id ? resultat.document : null;
  if (!document) return <Chargement />;
  if (document.statut === "brouillon" && peutAcheter && document.type === "facture") {
    return <Editeur key={document.id + version} brouillon={document} onEnregistre={recharger} />;
  }
  return <Consultation document={document} recharger={recharger} />;
}

/** Mode de paiement proposé selon le journal choisi */
function modePour(j: Journal | undefined): ModeReglement {
  return j?.type === "monnaie_electronique" ? "mobile_money" : j?.type === "banque" ? "virement" : "especes";
}

// ===========================================================================
// Saisie d'une facture fournisseur (brouillon)
// ===========================================================================

type Ligne = LigneSaisieAchat & { cle: number };
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
  compte_charge_id: null,
});

function Editeur({ brouillon, onEnregistre }: { brouillon?: DocumentAchat; onEnregistre: () => void }) {
  const router = useRouter();
  const { entreprise, boutique, boutiques } = useEspace();
  const achats = useAchats();
  const { fournisseurs, articles, taux, tauxDefaut, tauxParId, tresoreries, comptesCharges, compteParId, parametres } = achats;

  const [fournisseurId, setFournisseurId] = useState(brouillon?.fournisseur_id ?? "");
  const [numeroFournisseur, setNumeroFournisseur] = useState(brouillon?.numero_fournisseur ?? "");
  const [boutiqueId, setBoutiqueId] = useState(brouillon?.boutique_id ?? boutique?.id ?? "");
  const [date, setDate] = useState(brouillon?.date_document ?? aujourdhui());
  const [echeance, setEcheance] = useState(brouillon?.date_echeance ?? "");
  const [notes, setNotes] = useState(brouillon?.notes ?? "");
  const [lignes, setLignes] = useState<Ligne[]>(() =>
    brouillon?.lignes_documents_achat?.length
      ? brouillon.lignes_documents_achat.map((l) => ({
          cle: ++compteur,
          article_id: l.article_id,
          designation: l.designation,
          quantite: l.quantite,
          unite: l.unite,
          prix_unitaire: l.prix_unitaire,
          remise_pct: l.remise_pct,
          taux_tva_id: l.taux_tva_id,
          compte_charge_id: l.compte_charge_id,
        }))
      : [ligneVide()],
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<"brouillon" | "valider" | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [payer, setPayer] = useState(false);
  const [montantPaye, setMontantPaye] = useState<number | null>(null);
  const [referencePaiement, setReferencePaiement] = useState("");
  const [journalId, setJournalId] = useState(tresoreries.find((j) => j.type === "caisse")?.id ?? tresoreries[0]?.id ?? "");
  const [mode, setMode] = useState<ModeReglement>(modePour(tresoreries.find((j) => j.id === journalId)));

  const totaux = totauxAchat(lignes, tauxParId, tauxDefaut);
  const montantDecaisse = montantPaye ?? totaux.ttc;
  const boutiquesActives = boutiques.filter((b) => b.active);
  const articlesActifs = articles.filter((a) => a.actif);
  const tauxActifs = taux.filter((t) => t.actif);
  const articleParId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);

  if (!entreprise) return null;

  const maj = (cle: number, champs: Partial<Ligne>) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...champs } : l)));

  /** Compte utilisé par défaut pour une ligne (selon le type de l'article) */
  const compteDefaut = (l: Ligne) => {
    const service = l.article_id ? articleParId.get(l.article_id)?.type === "service" : false;
    const id = service ? parametres?.compte_achats_services_id : parametres?.compte_achats_biens_id;
    const c = id ? compteParId.get(id) : undefined;
    return c ? `${c.numero} — ${c.libelle}` : "Compte par défaut";
  };

  function verifier(): string | null {
    if (!fournisseurId) return "Choisissez le fournisseur.";
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
      const id = await enregistrerDocumentAchat(supabase, {
        entrepriseId: entreprise.entreprise_id,
        boutiqueId,
        fournisseurId,
        numeroFournisseur,
        date,
        dateEcheance: echeance || null,
        notes: notes.trim() || null,
        lignes: lignes.filter((l) => l.designation.trim() || l.article_id),
        documentId: brouillon?.id ?? null,
      });
      if (valider) {
        await validerDocumentAchat(
          supabase,
          id,
          payer && journalId && montantDecaisse > 0
            ? { montant: montantDecaisse, journal_id: journalId, mode, reference: referencePaiement.trim() || null }
            : null,
        );
      }
      if (brouillon) onEnregistre();
      else router.replace(`/achats/document?id=${id}`);
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(null);
      setConfirmation(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/achats" className="text-sm text-muted hover:text-foreground">← Achats</Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {brouillon ? "Facture fournisseur brouillon" : "Saisir une facture fournisseur"}
        </h1>
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}

      <Carte>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-sm font-medium">Fournisseur <span className="text-danger">*</span></span>
            <ChoixFournisseur
              entrepriseId={entreprise.entreprise_id}
              fournisseurs={fournisseurs}
              valeur={fournisseurId}
              onChange={setFournisseurId}
              onCree={achats.rafraichir}
            />
          </div>
          <Champ
            libelle="N° de la facture du fournisseur"
            value={numeroFournisseur}
            onChange={(e) => setNumeroFournisseur(e.target.value)}
            placeholder="Ex. : F-2026-118"
            aide="Obligatoire pour valider"
          />
          <Champ libelle="Date de la facture" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Champ
            libelle="Échéance"
            type="date"
            value={echeance}
            min={date}
            onChange={(e) => setEcheance(e.target.value)}
            aide={echeance ? undefined : "Par défaut : délai du fournisseur ou 30 jours"}
          />
          {boutiquesActives.length > 1 && (
            <Liste libelle="Boutique" value={boutiqueId} onChange={(e) => setBoutiqueId(e.target.value)}>
              {boutiquesActives.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </Liste>
          )}
        </div>
      </Carte>

      <Carte titre="Lignes">
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[64rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Désignation</th>
                <th className="w-56 pb-2 pl-2 font-medium">Compte</th>
                <th className="w-20 pb-2 pl-2 text-right font-medium">Qté</th>
                <th className="w-28 pb-2 pl-2 text-right font-medium">P.U. HT</th>
                <th className="w-20 pb-2 pl-2 text-right font-medium">Remise %</th>
                <th className="w-36 pb-2 pl-2 font-medium">TVA</th>
                <th className="w-28 pb-2 pl-2 text-right font-medium">Montant HT</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const tauxLigne = (l.taux_tva_id ? tauxParId.get(l.taux_tva_id) : undefined) ?? tauxDefaut;
                const m = calculerLigne(l.quantite || 0, l.prix_unitaire || 0, l.remise_pct || 0, tauxLigne?.taux ?? 0);
                return (
                  <tr key={l.cle} className="align-top">
                    <td className="py-1">
                      <ChoixArticle
                        articles={articlesActifs}
                        designation={l.designation}
                        onDesignation={(t) => maj(l.cle, { designation: t, article_id: null })}
                        onArticle={(a) => maj(l.cle, { article_id: a.id, designation: a.designation, unite: a.unite, taux_tva_id: a.taux_tva_id ?? l.taux_tva_id })}
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <div className="flex gap-1">
                        <div className="min-w-0 flex-1">
                          <ChoixCompte
                            comptes={comptesCharges}
                            valeur={l.compte_charge_id ?? ""}
                            onChange={(id) => maj(l.cle, { compte_charge_id: id })}
                            placeholder={compteDefaut(l)}
                            ariaLabel="Compte de charge"
                          />
                        </div>
                        {l.compte_charge_id && (
                          <button
                            type="button"
                            title="Revenir au compte par défaut"
                            aria-label="Revenir au compte par défaut"
                            onClick={() => maj(l.cle, { compte_charge_id: null })}
                            className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-retrait"
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-1 pl-2">
                      <input
                        aria-label="Quantité"
                        inputMode="decimal"
                        className="h-10 w-full rounded-xl border border-border bg-surface px-2 text-right text-sm outline-none focus:border-primary"
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
                        className="h-10 w-full rounded-xl border border-border bg-surface px-2 text-right text-sm outline-none focus:border-primary"
                        defaultValue={l.remise_pct ? String(l.remise_pct).replace(".", ",") : ""}
                        placeholder="0"
                        onChange={(e) => maj(l.cle, { remise_pct: Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)) })}
                      />
                    </td>
                    <td className="py-1 pl-2">
                      <Liste aria-label="Taux de TVA" value={tauxLigne?.id ?? ""} onChange={(e) => maj(l.cle, { taux_tva_id: e.target.value })}>
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
                        className="grid size-10 place-items-center rounded-lg text-muted hover:bg-surface-retrait hover:text-danger disabled:opacity-30"
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
          <div className="flex flex-col gap-2">
            <Bouton type="button" variante="secondaire" className="h-9 self-start" onClick={() => setLignes((ls) => [...ls, ligneVide()])}>
              + Ajouter une ligne
            </Bouton>
            <p className="max-w-md text-xs text-muted">
              Compte par défaut : 601 pour les marchandises, 6057 pour les services. Choisissez un autre compte pour un loyer (622),
              de l&apos;électricité (6052), du transport (61x) ou un équipement (classe 2).
            </p>
          </div>
          <table className="min-w-64 text-sm">
            <tbody>
              <tr><td className="py-0.5 pr-8 text-muted">Total HT</td><td className="montant text-right">{formaterXOF(totaux.ht)}</td></tr>
              <tr><td className="py-0.5 pr-8 text-muted">TVA déductible</td><td className="montant text-right">{formaterXOF(totaux.tva)}</td></tr>
              <tr className="border-t border-border text-base font-semibold">
                <td className="pt-1.5 pr-8">Total TTC</td><td className="montant pt-1.5 text-right">{formaterXOF(totaux.ttc)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Carte>

      <Carte titre="Notes internes">
        <textarea
          aria-label="Notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex. : livraison du 12, bon de commande n°…"
          className="w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
        />
      </Carte>

      {confirmation ? (
        <Carte titre="Valider la facture fournisseur">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              La facture reçoit un numéro interne et ne pourra plus être modifiée (seulement annulée par un avoir). L&apos;écriture
              d&apos;achat est passée en comptabilité (charges et TVA déductible au débit, fournisseur 401 au crédit).
            </p>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="accent-primary" checked={payer} onChange={(e) => setPayer(e.target.checked)} />
              Je paie le fournisseur maintenant (en tout ou en partie)
            </label>
            {payer && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <ChampMontant
                    libelle={`Montant payé (total : ${formaterXOF(totaux.ttc)})`}
                    valeur={montantDecaisse}
                    onChange={(v) => setMontantPaye(v)}
                  />
                  {montantDecaisse > totaux.ttc ? (
                    <span className="text-xs text-danger">Supérieur au total de la facture.</span>
                  ) : montantDecaisse > 0 && montantDecaisse < totaux.ttc ? (
                    <span className="text-xs text-muted">Acompte : il restera {formaterXOF(totaux.ttc - montantDecaisse)} à payer.</span>
                  ) : null}
                </div>
                <Champ libelle="Référence (n° transaction, chèque…)" value={referencePaiement} onChange={(e) => setReferencePaiement(e.target.value)} />
                <Liste
                  libelle="Payé depuis"
                  value={journalId}
                  onChange={(e) => {
                    setJournalId(e.target.value);
                    setMode(modePour(tresoreries.find((j) => j.id === e.target.value)));
                  }}
                >
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
                disabled={payer && (montantDecaisse <= 0 || montantDecaisse > totaux.ttc || !journalId)}
                onClick={() => void enregistrer(true)}
              >
                Valider{payer ? " et payer" : ""}
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
            disabled={totaux.ttc <= 0}
            onClick={() => {
              const invalide = verifier() ?? (numeroFournisseur.trim() ? null : "Indiquez le numéro de la facture du fournisseur.");
              if (invalide) return setErreur(invalide);
              setErreur(null);
              setConfirmation(true);
            }}
          >
            Valider la facture…
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
    if (!q) return [];
    return articles
      .filter((a) => a.designation.toLowerCase().includes(q) || (a.reference ?? "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [articles, designation]);

  return (
    <div ref={conteneur} className="relative" onBlur={(e) => !conteneur.current?.contains(e.relatedTarget as Node) && setOuvert(false)}>
      <input
        aria-label="Désignation"
        className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        placeholder="Désignation (ou article du catalogue)…"
        value={designation}
        onFocus={() => setOuvert(true)}
        onChange={(e) => {
          onDesignation(e.target.value);
          setOuvert(true);
        }}
      />
      {ouvert && resultats.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full min-w-72 overflow-auto rounded-xl border border-border bg-surface py-1 text-sm shadow-menu">
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
              {a.reference && <span className="ml-auto shrink-0 font-mono text-xs text-muted">{a.reference}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===========================================================================
// Consultation d'une facture ou d'un avoir validé
// ===========================================================================

function Consultation({ document: d, recharger }: { document: DocumentAchat; recharger: () => void }) {
  const router = useRouter();
  const { boutiques } = useEspace();
  const { fournisseurParId, tresoreries, compteParId, peutAcheter } = useAchats();
  const [paiements, setPaiements] = useState<PaiementFournisseur[]>([]);
  const [origine, setOrigine] = useState<DocumentAchat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [panneau, setPanneau] = useState<"paiement" | "avoir" | null>(null);

  useEffect(() => {
    let actif = true;
    Promise.all([
      d.type === "facture" ? chargerPaiementsFournisseur(supabase, d.id) : Promise.resolve([]),
      d.document_origine_id ? chargerDocumentAchat(supabase, d.document_origine_id) : Promise.resolve(null),
    ]).then(
      ([p, o]) => {
        if (!actif) return;
        setPaiements(p);
        setOrigine(o);
      },
      (e: Error) => actif && setErreur(e.message),
    );
    return () => {
      actif = false;
    };
  }, [d]);

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

  const reste = resteAPayerAchat(d);
  const fournisseur = fournisseurParId.get(d.fournisseur_id);
  const titre = d.type === "avoir" ? `Avoir fournisseur ${d.numero}` : d.numero ? `Facture fournisseur ${d.numero}` : "Facture fournisseur (brouillon)";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/achats" className="text-sm text-muted hover:text-foreground">← Achats</Link>
        <h1 className="text-2xl font-semibold tracking-tight">{titre}</h1>
        <BadgeEtatAchat document={d} />
        <div className="ml-auto flex flex-wrap gap-2">
          {peutAcheter && d.type === "facture" && d.statut === "valide" && reste > 0 && (
            <Bouton onClick={() => setPanneau("paiement")}>Enregistrer un paiement</Bouton>
          )}
          {peutAcheter && d.type === "facture" && d.statut === "valide" && d.montant_paye === 0 && d.montant_avoir === 0 && (
            <Bouton variante="danger" onClick={() => setPanneau("avoir")}>Annuler par un avoir</Bouton>
          )}
          {peutAcheter && d.statut === "brouillon" && (
            <Bouton variante="danger" onClick={() => {
              if (confirm("Supprimer ce brouillon ?")) void agir(async () => { await supprimerDocumentAchat(supabase, d.id); router.push("/achats"); });
            }}>Supprimer</Bouton>
          )}
        </div>
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}
      {message && <Alerte type="succes">{message}</Alerte>}

      {panneau === "paiement" && (
        <PanneauPaiement
          reste={reste}
          tresoreries={tresoreries}
          onAnnuler={() => setPanneau(null)}
          onValider={(p) => agir(() => enregistrerPaiementFournisseur(supabase, d.id, p), `Paiement de ${formaterXOF(p.montant)} enregistré.`)}
        />
      )}
      {panneau === "avoir" && (
        <PanneauAvoir
          numero={d.numero_fournisseur ?? d.numero ?? ""}
          onAnnuler={() => setPanneau(null)}
          onValider={(motif, numeroAvoir) => agir(async () => {
            const id = await creerAvoirAchat(supabase, d.id, motif, undefined, numeroAvoir);
            router.push(`/achats/document?id=${id}`);
          })}
        />
      )}

      {d.type === "facture" && d.statut === "valide" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-carte">
            <p className="text-sm text-muted">Total TTC</p>
            <p className="montant mt-1 text-lg font-semibold">{formaterXOF(d.total_ttc)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-carte">
            <p className="text-sm text-muted">Payé{d.montant_avoir ? " / avoir" : ""}</p>
            <p className="montant mt-1 text-lg font-semibold">{formaterXOF(d.montant_paye + d.montant_avoir)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-carte">
            <p className="text-sm text-muted">Reste à payer</p>
            <p className={`montant mt-1 text-lg font-semibold ${reste > 0 ? "" : "text-primary"}`}>{formaterXOF(reste)}</p>
            {d.date_echeance && reste > 0 && <p className="text-xs text-muted">Échéance : {formaterDate(d.date_echeance)}</p>}
          </div>
        </div>
      )}

      <Carte>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted">Fournisseur</dt>
            <dd className="font-medium">{fournisseur?.nom ?? d.fournisseurs?.nom}</dd>
            {fournisseur?.telephone && <dd className="text-muted">{fournisseur.telephone}</dd>}
          </div>
          <div>
            <dt className="text-muted">{d.type === "avoir" ? "N° d'avoir du fournisseur" : "N° de facture du fournisseur"}</dt>
            <dd className="font-medium">{d.numero_fournisseur ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Date</dt>
            <dd className="font-medium">{formaterDate(d.date_document)}</dd>
            {d.type === "facture" && d.date_echeance && <dd className="text-muted">Échéance {formaterDate(d.date_echeance)}</dd>}
          </div>
          <div>
            <dt className="text-muted">Boutique</dt>
            <dd className="font-medium">{boutiques.find((b) => b.id === d.boutique_id)?.nom}</dd>
          </div>
        </dl>
        {d.notes && <p className="mt-4 border-t border-border pt-3 text-sm">{d.notes}</p>}
      </Carte>

      <Carte titre="Lignes">
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-border bg-surface-retrait text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Désignation</th>
                <th className="px-2 py-2.5 font-medium">Compte</th>
                <th className="px-2 py-2.5 text-right font-medium">Qté</th>
                <th className="px-2 py-2.5 text-right font-medium">P.U. HT</th>
                <th className="px-2 py-2.5 text-right font-medium">TVA</th>
                <th className="px-5 py-2.5 text-right font-medium">Montant HT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.lignes_documents_achat?.map((l) => {
                const c = compteParId.get(l.compte_charge_id);
                return (
                  <tr key={l.id}>
                    <td className="px-5 py-2.5">
                      {l.designation}
                      {l.remise_pct > 0 && <span className="ml-2 text-xs text-muted">remise {formaterQuantite(l.remise_pct)} %</span>}
                    </td>
                    <td className="px-2 py-2.5 text-muted">{c ? `${c.numero} ${c.libelle}` : ""}</td>
                    <td className="px-2 py-2.5 text-right">{formaterQuantite(l.quantite)} {l.unite ?? ""}</td>
                    <td className="montant px-2 py-2.5 text-right">{formaterXOF(l.prix_unitaire, { symbole: false })}</td>
                    <td className="px-2 py-2.5 text-right">{l.taux_tva ? `${formaterQuantite(l.taux_tva)} %` : "Exonéré"}</td>
                    <td className="montant px-5 py-2.5 text-right font-medium">{formaterXOF(l.montant_ht, { symbole: false })}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-border">
              <tr><td colSpan={5} className="px-2 pt-3 text-right text-muted">Total HT</td><td className="montant px-5 pt-3 text-right">{formaterXOF(d.total_ht)}</td></tr>
              <tr><td colSpan={5} className="px-2 text-right text-muted">TVA déductible</td><td className="montant px-5 text-right">{formaterXOF(d.total_tva)}</td></tr>
              <tr className="font-semibold">
                <td colSpan={5} className="px-2 pb-3 text-right">Total TTC</td><td className="montant px-5 pb-3 text-right">{formaterXOF(d.total_ttc)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Carte>

      {paiements.length > 0 && (
        <Carte titre="Paiements">
          <ul className="-my-2 divide-y divide-border text-sm">
            {paiements.map((p) => (
              <li key={p.id} className="flex flex-wrap gap-3 py-2">
                <span>{formaterDate(p.date_paiement)}</span>
                <span className="text-muted">
                  {[LIBELLES_MODES_REGLEMENT[p.mode], tresoreries.find((j) => j.id === p.journal_id)?.libelle, p.reference]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="montant ml-auto font-medium">{formaterXOF(p.montant)}</span>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      {origine && (
        <p className="text-sm text-muted">
          Avoir sur la facture{" "}
          <Link href={`/achats/document?id=${origine.id}`} className="text-primary hover:underline">
            {origine.numero} ({origine.numero_fournisseur})
          </Link>
        </p>
      )}
      {d.statut === "valide" && (
        <p className="text-xs text-muted">
          Écriture comptable générée automatiquement au journal des achats.{" "}
          <LienBouton href="/comptabilite" variante="discret" className="h-auto px-0 text-xs">Voir la comptabilité</LienBouton>
        </p>
      )}
    </div>
  );
}

function PanneauPaiement({
  reste,
  tresoreries,
  onAnnuler,
  onValider,
}: {
  reste: number;
  tresoreries: Journal[];
  onAnnuler: () => void;
  onValider: (p: { montant: number; journalId: string; mode: ModeReglement; date: string; reference: string | null }) => Promise<void>;
}) {
  const initial = tresoreries.find((j) => j.type === "caisse") ?? tresoreries[0];
  const [montant, setMontant] = useState(reste);
  const [journalId, setJournalId] = useState(initial?.id ?? "");
  const [mode, setMode] = useState<ModeReglement>(modePour(initial));
  const [date, setDate] = useState(aujourdhui());
  const [reference, setReference] = useState("");
  const [envoi, setEnvoi] = useState(false);

  return (
    <Carte titre="Enregistrer un paiement">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <ChampMontant libelle={`Montant (reste : ${formaterXOF(reste)})`} valeur={montant} onChange={setMontant} />
        <Champ libelle="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Liste libelle="Payé depuis" value={journalId} onChange={(e) => {
          setJournalId(e.target.value);
          setMode(modePour(tresoreries.find((j) => j.id === e.target.value)));
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

function PanneauAvoir({
  numero,
  onAnnuler,
  onValider,
}: {
  numero: string;
  onAnnuler: () => void;
  onValider: (motif: string, numeroAvoir: string | null) => Promise<void>;
}) {
  const [motif, setMotif] = useState("");
  const [numeroAvoir, setNumeroAvoir] = useState("");
  const [envoi, setEnvoi] = useState(false);
  return (
    <Carte titre={`Annuler la facture ${numero} par un avoir`}>
      <p className="mb-4 text-sm text-muted">
        Un avoir du même montant est enregistré ; l&apos;écriture inverse est passée en comptabilité. La facture reste dans
        l&apos;historique.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : marchandise retournée, erreur de facturation…" required />
        <Champ libelle="N° de l'avoir du fournisseur (facultatif)" value={numeroAvoir} onChange={(e) => setNumeroAvoir(e.target.value)} />
      </div>
      <div className="mt-4 flex justify-end gap-3">
        <Bouton variante="secondaire" onClick={onAnnuler}>Retour</Bouton>
        <Bouton
          variante="danger"
          chargement={envoi}
          disabled={!motif.trim()}
          onClick={async () => {
            setEnvoi(true);
            await onValider(motif.trim(), numeroAvoir.trim() || null);
            setEnvoi(false);
          }}
        >
          Enregistrer l&apos;avoir
        </Bouton>
      </div>
    </Carte>
  );
}
