"use client";

import {
  aujourdhui,
  creerClient,
  etatFacture,
  formaterDate,
  formaterQuantite,
  formaterXOF,
  LIBELLES_ETATS,
  LIBELLES_TYPES_DOCUMENT,
  libelleIdentifiantFiscal,
  montantEnLettres,
  nomPays,
  resteAPayer,
  type Boutique,
  type Client,
  type DocumentVente,
  type Entreprise,
  type EtatPaiement,
} from "@facturall/core";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";

import { Alerte, Badge, Bouton, Champ } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// État d'un document
// ---------------------------------------------------------------------------

const TONS: Record<EtatPaiement, "vert" | "gris" | "neutre" | "rouge"> = {
  brouillon: "gris",
  a_payer: "neutre",
  partiel: "neutre",
  paye: "vert",
  en_retard: "rouge",
  annulee: "gris",
};

const STATUTS_DEVIS: Record<string, string> = {
  brouillon: "Brouillon",
  valide: "Envoyé",
  transforme: "Facturé",
  annule: "Annulé",
};

export function BadgeEtat({ document: d }: { document: DocumentVente }) {
  if (d.type === "devis") {
    const ton = d.statut === "transforme" ? "vert" : d.statut === "valide" ? "neutre" : "gris";
    return <Badge ton={ton}>{STATUTS_DEVIS[d.statut]}</Badge>;
  }
  if (d.type === "avoir") return <Badge ton="gris">Avoir</Badge>;
  const etat = etatFacture(d, aujourdhui());
  if (TONS[etat] === "rouge") {
    return (
      <span className="inline-flex rounded-md border border-danger/30 bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
        {LIBELLES_ETATS[etat]}
      </span>
    );
  }
  return <Badge ton={TONS[etat] as "vert" | "gris" | "neutre"}>{LIBELLES_ETATS[etat]}</Badge>;
}

// ---------------------------------------------------------------------------
// Choix du client, avec création rapide
// ---------------------------------------------------------------------------

export function ChoixClient({
  entrepriseId,
  clients,
  valeur,
  onChange,
  onCree,
}: {
  entrepriseId: string;
  clients: Client[];
  valeur: string;
  onChange: (id: string) => void;
  onCree: (c: Client) => void;
}) {
  const id = useId();
  const conteneur = useRef<HTMLDivElement>(null);
  const [recherche, setRecherche] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [creation, setCreation] = useState(false);
  const choisi = clients.find((c) => c.id === valeur);

  const resultats = useMemo(() => {
    const q = (recherche ?? "").trim().toLowerCase();
    return clients
      .filter((c) => c.actif)
      .filter((c) => !q || c.nom.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.telephone ?? "").includes(q))
      .slice(0, 30);
  }, [clients, recherche]);

  if (creation) {
    return (
      <NouveauClientRapide
        entrepriseId={entrepriseId}
        nomInitial={recherche ?? ""}
        onAnnuler={() => setCreation(false)}
        onCree={(c) => {
          onCree(c);
          onChange(c.id);
          setCreation(false);
          setRecherche(null);
        }}
      />
    );
  }

  return (
    <div
      ref={conteneur}
      className="relative"
      onBlur={(e) => {
        if (!conteneur.current?.contains(e.relatedTarget as Node)) {
          setOuvert(false);
          setRecherche(null);
        }
      }}
    >
      <input
        role="combobox"
        aria-label="Client"
        aria-expanded={ouvert}
        aria-controls={id}
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        placeholder="Nom, code ou téléphone…"
        value={recherche ?? (choisi ? `${choisi.nom} (${choisi.code})` : "")}
        onFocus={(e) => {
          setOuvert(true);
          e.target.select();
        }}
        onChange={(e) => {
          setRecherche(e.target.value);
          setOuvert(true);
        }}
      />
      {ouvert && (
        <ul id={id} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface py-1 text-sm shadow-lg">
          {resultats.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c.id === valeur}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(c.id);
                setOuvert(false);
                setRecherche(null);
              }}
              className="flex cursor-pointer gap-3 px-3 py-1.5 hover:bg-primary-soft"
            >
              <span className="w-14 shrink-0 font-mono text-xs leading-5 text-muted">{c.code}</span>
              <span className="truncate">{c.nom}</span>
              {c.telephone && <span className="ml-auto text-xs text-muted">{c.telephone}</span>}
            </li>
          ))}
          <li
            role="option"
            aria-selected={false}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCreation(true)}
            className="cursor-pointer border-t border-border px-3 py-2 font-medium text-primary hover:bg-primary-soft"
          >
            + Nouveau client{recherche ? ` « ${recherche} »` : ""}
          </li>
        </ul>
      )}
    </div>
  );
}

function NouveauClientRapide({
  entrepriseId,
  nomInitial,
  onAnnuler,
  onCree,
}: {
  entrepriseId: string;
  nomInitial: string;
  onAnnuler: () => void;
  onCree: (c: Client) => void;
}) {
  const [nom, setNom] = useState(nomInitial);
  const [telephone, setTelephone] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function creer(e?: FormEvent) {
    e?.preventDefault();
    if (nom.trim().length < 2) return setErreur("Saisissez le nom du client.");
    setEnvoi(true);
    try {
      onCree(await creerClient(supabase, entrepriseId, { nom: nom.trim(), telephone: telephone.trim() || null }));
    } catch (err) {
      setErreur((err as Error).message);
      setEnvoi(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary-soft/40 p-3">
      {erreur && <Alerte>{erreur}</Alerte>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Nom du client" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
        <Champ libelle="Téléphone" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Bouton type="button" variante="discret" className="h-8" onClick={onAnnuler}>Annuler</Bouton>
        <Bouton type="button" className="h-8" chargement={envoi} onClick={() => void creer()}>Créer le client</Bouton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document imprimable (A4)
// ---------------------------------------------------------------------------

export function DocumentImprimable({
  document: d,
  entreprise: e,
  boutique,
  client,
  mentions,
  numeroOrigine,
}: {
  document: DocumentVente;
  entreprise: Entreprise;
  boutique: Boutique | undefined;
  client: Client | undefined;
  mentions: string | null;
  numeroOrigine?: string | null;
}) {
  const lignes = d.lignes_documents_vente ?? [];
  const avecRemise = lignes.some((l) => l.remise_pct > 0);
  const tvaParTaux = new Map<number, { base: number; tva: number }>();
  for (const l of lignes) {
    const t = tvaParTaux.get(l.taux_tva) ?? { base: 0, tva: 0 };
    tvaParTaux.set(l.taux_tva, { base: t.base + l.montant_ht, tva: t.tva + l.montant_tva });
  }
  const titre = d.type === "devis" ? "Devis" : d.type === "avoir" ? "Facture d'avoir" : "Facture";

  return (
    <article className="document-imprimable mx-auto w-full max-w-[210mm] bg-white p-8 text-[13px] leading-relaxed text-black shadow-sm print:max-w-none print:p-0 print:shadow-none sm:p-12">
      <header className="flex flex-wrap justify-between gap-6 border-b-2 border-black/80 pb-5">
        <div>
          <p className="text-xl font-bold">{e.raison_sociale}</p>
          {e.forme_juridique && <p>{e.forme_juridique}</p>}
          {(e.adresse || e.ville) && <p>{[e.adresse, e.ville].filter(Boolean).join(", ")} — {nomPays(e.pays)}</p>}
          {e.telephone && <p>Tél. : {e.telephone}</p>}
          {e.email && <p>{e.email}</p>}
          {boutique && !boutique.est_principale && <p className="mt-1 text-black/60">Point de vente : {boutique.nom}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold uppercase tracking-wide">{titre}</p>
          <p className="font-mono text-base font-semibold">{d.numero ?? "BROUILLON"}</p>
          <p>Date : {formaterDate(d.date_document)}</p>
          {d.type === "facture" && d.date_echeance && <p>Échéance : {formaterDate(d.date_echeance)}</p>}
          {d.type === "devis" && d.date_echeance && <p>Valable jusqu&apos;au {formaterDate(d.date_echeance)}</p>}
          {numeroOrigine && <p>{d.type === "avoir" ? "Sur facture" : "D'après devis"} {numeroOrigine}</p>}
        </div>
      </header>

      <section className="mt-6 flex justify-end">
        <div className="w-full max-w-xs rounded border border-black/30 p-3">
          <p className="text-xs uppercase tracking-wide text-black/60">Client</p>
          <p className="font-semibold">{client?.nom}</p>
          {client?.adresse && <p>{client.adresse}</p>}
          {client?.ville && <p>{client.ville}</p>}
          {client?.telephone && <p>Tél. : {client.telephone}</p>}
          {client?.identifiant_fiscal && <p>{libelleIdentifiantFiscal(e.pays)} : {client.identifiant_fiscal}</p>}
          {d.reference_client && <p className="mt-1">Votre réf. : {d.reference_client}</p>}
        </div>
      </section>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-y border-black/70 text-left text-xs uppercase">
            <th className="py-2 pr-2 font-semibold">Désignation</th>
            <th className="px-2 py-2 text-right font-semibold">Qté</th>
            <th className="px-2 py-2 text-right font-semibold">P.U. HT</th>
            {avecRemise && <th className="px-2 py-2 text-right font-semibold">Remise</th>}
            <th className="px-2 py-2 text-right font-semibold">TVA</th>
            <th className="py-2 pl-2 text-right font-semibold">Montant HT</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id} className="border-b border-black/15 align-top">
              <td className="py-1.5 pr-2">{l.designation}</td>
              <td className="montant whitespace-nowrap px-2 py-1.5 text-right">
                {formaterQuantite(l.quantite)} {l.unite && l.unite !== "unité" ? l.unite : ""}
              </td>
              <td className="montant whitespace-nowrap px-2 py-1.5 text-right">{formaterXOF(l.prix_unitaire, { symbole: false })}</td>
              {avecRemise && <td className="px-2 py-1.5 text-right">{l.remise_pct ? `${formaterQuantite(l.remise_pct)} %` : ""}</td>}
              <td className="whitespace-nowrap px-2 py-1.5 text-right">{formaterQuantite(l.taux_tva)} %</td>
              <td className="montant whitespace-nowrap py-1.5 pl-2 text-right">{formaterXOF(l.montant_ht, { symbole: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-5 flex flex-wrap items-start justify-between gap-6">
        <table className="text-xs">
          <thead>
            <tr className="text-left text-black/60">
              <th className="pr-4 font-medium">Taux TVA</th>
              <th className="pr-4 text-right font-medium">Base HT</th>
              <th className="text-right font-medium">TVA</th>
            </tr>
          </thead>
          <tbody>
            {[...tvaParTaux.entries()].map(([taux, v]) => (
              <tr key={taux}>
                <td className="pr-4">{taux === 0 ? "Exonéré" : `${formaterQuantite(taux)} %`}</td>
                <td className="montant pr-4 text-right">{formaterXOF(v.base, { symbole: false })}</td>
                <td className="montant text-right">{formaterXOF(v.tva, { symbole: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="min-w-60 text-sm">
          <tbody>
            <tr><td className="py-0.5 pr-6">Total HT</td><td className="montant text-right">{formaterXOF(d.total_ht)}</td></tr>
            <tr><td className="py-0.5 pr-6">TVA</td><td className="montant text-right">{formaterXOF(d.total_tva)}</td></tr>
            <tr className="border-t border-black/70 text-base font-bold">
              <td className="py-1 pr-6">Total TTC</td><td className="montant text-right">{formaterXOF(d.total_ttc)}</td>
            </tr>
            {d.type === "facture" && d.montant_regle > 0 && (
              <>
                <tr><td className="py-0.5 pr-6">Déjà réglé</td><td className="montant text-right">− {formaterXOF(d.montant_regle)}</td></tr>
                <tr className="font-semibold"><td className="py-0.5 pr-6">Reste à payer</td><td className="montant text-right">{formaterXOF(resteAPayer(d))}</td></tr>
              </>
            )}
          </tbody>
        </table>
      </section>

      {d.type !== "devis" && (
        <p className="mt-6 border-y border-black/20 py-2 italic">
          Arrêté{d.type === "facture" ? "e la présente facture" : " le présent avoir"} à la somme de{" "}
          <strong className="not-italic">{montantEnLettres(d.total_ttc)}</strong> toutes taxes comprises.
        </p>
      )}

      {d.notes && <p className="mt-4 whitespace-pre-line">{d.notes}</p>}
      {mentions && <p className="mt-4 whitespace-pre-line text-xs text-black/70">{mentions}</p>}

      <footer className="mt-10 border-t border-black/20 pt-3 text-center text-[11px] text-black/60">
        {e.raison_sociale}
        {e.rccm && ` · RCCM ${e.rccm}`}
        {e.identifiant_fiscal && ` · ${libelleIdentifiantFiscal(e.pays)} ${e.identifiant_fiscal}`}
        {` · ${LIBELLES_TYPES_DOCUMENT[d.type]} ${d.numero ?? "brouillon"}`}
      </footer>
    </article>
  );
}
