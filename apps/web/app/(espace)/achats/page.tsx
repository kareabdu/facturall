"use client";

import {
  aujourdhui,
  chargerDocumentsAchat,
  etatAchat,
  formaterDate,
  formaterXOF,
  resteAPayerAchat,
  type DocumentAchat,
  type TypeDocumentAchat,
} from "@facturall/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BadgeEtatAchat } from "@/components/achats";
import { Montant } from "@/components/compta";
import { Alerte, Carte, Chargement, LienBouton } from "@/components/ui";
import { useAchats } from "@/lib/achats";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

const ONGLETS: { type: TypeDocumentAchat; libelle: string }[] = [
  { type: "facture", libelle: "Factures" },
  { type: "avoir", libelle: "Avoirs" },
];

export default function PageAchats() {
  const { entreprise, boutique } = useEspace();
  const { peutAcheter } = useAchats();
  const [type, setType] = useState<TypeDocumentAchat>("facture");
  const [toutesBoutiques, setToutesBoutiques] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [resultat, setResultat] = useState<{ cle: string; documents: DocumentAchat[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const cle = `${entreprise?.entreprise_id}|${type}|${toutesBoutiques ? "" : boutique?.id}`;
  useEffect(() => {
    if (!entreprise) return;
    let actif = true;
    chargerDocumentsAchat(supabase, entreprise.entreprise_id, { type, boutiqueId: toutesBoutiques ? undefined : boutique?.id })
      .then((documents) => actif && setResultat({ cle, documents }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [entreprise, type, toutesBoutiques, boutique, cle]);

  const documents = resultat?.cle === cle ? resultat.documents : null;

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (documents ?? []).filter(
      (d) =>
        !q ||
        (d.numero ?? "").toLowerCase().includes(q) ||
        (d.numero_fournisseur ?? "").toLowerCase().includes(q) ||
        (d.fournisseurs?.nom ?? "").toLowerCase().includes(q),
    );
  }, [documents, recherche]);

  const indicateurs = useMemo(() => {
    if (type !== "facture" || !documents) return null;
    const jour = aujourdhui();
    const validees = documents.filter((d) => d.statut === "valide");
    return {
      achats: validees.reduce((s, d) => s + d.total_ttc, 0),
      aPayer: validees.reduce((s, d) => s + resteAPayerAchat(d), 0),
      echu: validees.filter((d) => etatAchat(d, jour) === "en_retard").reduce((s, d) => s + resteAPayerAchat(d), 0),
      brouillons: documents.filter((d) => d.statut === "brouillon").length,
    };
  }, [documents, type]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-background p-1">
          {ONGLETS.map((o) => (
            <button
              key={o.type}
              onClick={() => setType(o.type)}
              className={`h-9 rounded-lg px-4 text-sm font-medium ${type === o.type ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
            >
              {o.libelle}
            </button>
          ))}
        </div>
        <input
          aria-label="Rechercher"
          placeholder="N°, n° fournisseur ou fournisseur…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="h-10 min-w-48 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary sm:max-w-72"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="accent-primary" checked={!toutesBoutiques} onChange={(e) => setToutesBoutiques(!e.target.checked)} />
          {boutique?.nom ?? "Boutique active"} uniquement
        </label>
        {peutAcheter && (
          <LienBouton className="ml-auto" href="/achats/document">Saisir une facture</LienBouton>
        )}
      </div>

      {indicateurs && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Achats (TTC)", formaterXOF(indicateurs.achats), ""],
            ["À payer", formaterXOF(indicateurs.aPayer), ""],
            ["Dont échu", formaterXOF(indicateurs.echu), indicateurs.echu > 0 ? "text-danger" : ""],
            ["Brouillons", String(indicateurs.brouillons), ""],
          ].map(([libelle, valeur, classe]) => (
            <div key={libelle} className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm text-muted">{libelle}</p>
              <p className={`montant mt-1 text-lg font-semibold ${classe}`}>{valeur}</p>
            </div>
          ))}
        </div>
      )}

      {erreur && <Alerte>{erreur}</Alerte>}

      <Carte>
        {!documents ? (
          <Chargement />
        ) : filtres.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Aucun document.{" "}
            {peutAcheter && type === "facture" && (
              <Link href="/achats/document" className="text-primary hover:underline">Saisir une facture fournisseur</Link>
            )}
          </p>
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">N° interne</th>
                  <th className="px-2 py-2.5 font-medium">N° fournisseur</th>
                  <th className="px-2 py-2.5 font-medium">Date</th>
                  <th className="px-2 py-2.5 font-medium">Fournisseur</th>
                  <th className="px-2 py-2.5 font-medium">État</th>
                  <th className="px-2 py-2.5 text-right font-medium">Total TTC</th>
                  {type === "facture" && <th className="px-5 py-2.5 text-right font-medium">Reste à payer</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtres.map((d) => (
                  <tr key={d.id} className="hover:bg-background">
                    <td className="px-5 py-3 font-mono text-xs">
                      <Link href={`/achats/document?id=${d.id}`} className="font-medium text-primary hover:underline">
                        {d.numero ?? "—"}
                      </Link>
                    </td>
                    <td className="px-2 py-3">{d.numero_fournisseur ?? ""}</td>
                    <td className="whitespace-nowrap px-2 py-3">{formaterDate(d.date_document)}</td>
                    <td className="px-2 py-3">
                      <Link href={`/achats/document?id=${d.id}`} className="hover:underline">{d.fournisseurs?.nom}</Link>
                    </td>
                    <td className="px-2 py-3"><BadgeEtatAchat document={d} /></td>
                    <td className="px-2 py-3 text-right font-medium"><Montant valeur={d.total_ttc} /></td>
                    {type === "facture" && (
                      <td className="px-5 py-3 text-right">
                        {d.statut === "valide" ? <Montant valeur={resteAPayerAchat(d)} /> : ""}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </div>
  );
}
