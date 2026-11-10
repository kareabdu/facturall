"use client";

import {
  aujourdhui,
  chargerDocuments,
  etatFacture,
  formaterDate,
  formaterXOF,
  resteAPayer,
  type DocumentVente,
  type TypeDocument,
} from "@facturall/core";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Montant } from "@/components/compta";
import { Alerte, Carte, Chargement, Indicateur, LienBouton } from "@/components/ui";
import { BadgeEtat } from "@/components/ventes";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";
import { useVentes } from "@/lib/ventes";

const ONGLETS: { type: TypeDocument; libelle: string }[] = [
  { type: "facture", libelle: "Factures" },
  { type: "devis", libelle: "Devis" },
  { type: "avoir", libelle: "Avoirs" },
];

export default function PageVentes() {
  const { entreprise, boutique } = useEspace();
  const { peutVendre } = useVentes();
  const [type, setType] = useState<TypeDocument>("facture");
  const [toutesBoutiques, setToutesBoutiques] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [documents, setDocuments] = useState<DocumentVente[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!entreprise) return;
    setDocuments(null);
    try {
      setDocuments(
        await chargerDocuments(supabase, entreprise.entreprise_id, {
          type,
          boutiqueId: toutesBoutiques ? undefined : boutique?.id,
        }),
      );
    } catch (e) {
      setErreur((e as Error).message);
    }
  }, [entreprise, type, toutesBoutiques, boutique]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (documents ?? []).filter(
      (d) => !q || (d.numero ?? "").toLowerCase().includes(q) || (d.clients?.nom ?? "").toLowerCase().includes(q),
    );
  }, [documents, recherche]);

  const indicateurs = useMemo(() => {
    if (type !== "facture" || !documents) return null;
    const jour = aujourdhui();
    const validees = documents.filter((d) => d.statut === "valide");
    return {
      facture: validees.reduce((s, d) => s + d.total_ttc, 0),
      aEncaisser: validees.reduce((s, d) => s + resteAPayer(d), 0),
      enRetard: validees.filter((d) => etatFacture(d, jour) === "en_retard").reduce((s, d) => s + resteAPayer(d), 0),
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
          placeholder="N° ou client…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="h-10 min-w-48 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary sm:max-w-64"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="accent-primary" checked={!toutesBoutiques} onChange={(e) => setToutesBoutiques(!e.target.checked)} />
          {boutique?.nom ?? "Boutique active"} uniquement
        </label>
        {peutVendre && (
          <div className="ml-auto flex gap-2">
            <LienBouton href="/ventes/document?type=devis" variante="secondaire">
              Nouveau devis
            </LienBouton>
            <LienBouton href="/ventes/document?type=facture">Nouvelle facture</LienBouton>
          </div>
        )}
      </div>

      {indicateurs && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Facturé (TTC)", formaterXOF(indicateurs.facture), ""],
            ["À encaisser", formaterXOF(indicateurs.aEncaisser), ""],
            ["Dont en retard", formaterXOF(indicateurs.enRetard), indicateurs.enRetard > 0 ? "text-danger" : ""],
            ["Brouillons", String(indicateurs.brouillons), ""],
          ].map(([libelle, valeur, classe]) => (
            <Indicateur
              key={libelle}
              libelle={libelle}
              valeur={valeur}
              ton={classe.includes("danger") ? "danger" : classe.includes("warning") ? "attention" : "neutre"}
            />
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
            {peutVendre && type !== "avoir" && (
              <Link href={`/ventes/document?type=${type}`} className="text-primary hover:underline">
                Créer {type === "devis" ? "un devis" : "une facture"}
              </Link>
            )}
          </p>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-border bg-surface-retrait text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">N°</th>
                  <th className="px-2 py-2.5 font-medium">Date</th>
                  <th className="px-2 py-2.5 font-medium">Client</th>
                  <th className="px-2 py-2.5 font-medium">État</th>
                  <th className="px-2 py-2.5 text-right font-medium">Total TTC</th>
                  {type === "facture" && <th className="px-5 py-2.5 text-right font-medium">Reste dû</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtres.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-retrait">
                    <td className="px-5 py-3 font-mono text-xs">
                      <Link href={`/ventes/document?id=${d.id}`} className="font-medium text-primary hover:underline">
                        {d.numero ?? "—"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">{formaterDate(d.date_document)}</td>
                    <td className="px-2 py-3">
                      <Link href={`/ventes/document?id=${d.id}`} className="hover:underline">
                        {d.clients?.nom}
                      </Link>
                    </td>
                    <td className="px-2 py-3"><BadgeEtat document={d} /></td>
                    <td className="px-2 py-3 text-right font-medium"><Montant valeur={d.total_ttc} /></td>
                    {type === "facture" && (
                      <td className="px-5 py-3 text-right">
                        {d.statut === "valide" ? <Montant valeur={resteAPayer(d)} /> : ""}
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
