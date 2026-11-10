"use client";

import {
  chargerMouvements,
  formaterDate,
  formaterQuantite,
  LIBELLES_MOUVEMENTS,
  type MouvementStock,
} from "@facturall/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Montant } from "@/components/compta";
import { ChoixArticleStock, QuantiteSignee } from "@/components/stock";
import { Alerte, Carte, Chargement, Liste } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { useStock } from "@/lib/stock";
import { supabase } from "@/lib/supabase";

export default function PageMouvements() {
  return (
    <Suspense fallback={<Chargement />}>
      <Mouvements />
    </Suspense>
  );
}

/** Lien vers le document à l'origine du mouvement */
function Origine({ m }: { m: MouvementStock }) {
  const href = m.document_vente_id
    ? `/ventes/document?id=${m.document_vente_id}`
    : m.document_achat_id
      ? `/achats/document?id=${m.document_achat_id}`
      : m.inventaire_id
        ? `/stock/inventaire?id=${m.inventaire_id}`
        : m.transfert_id
          ? "/stock/transferts"
          : null;
  if (!href) return <span className="text-muted">{m.motif}</span>;
  return (
    <Link href={href} className="text-primary hover:underline">
      {m.motif ?? "Voir"}
    </Link>
  );
}

function Mouvements() {
  const { entreprise } = useEspace();
  const { articles, boutiques, boutiqueParId, articleParId } = useStock();
  const params = useSearchParams();
  const router = useRouter();
  const articleId = params.get("article") ?? "";
  const boutiqueId = params.get("boutique") ?? "";
  const [resultat, setResultat] = useState<{ cle: string; mouvements: MouvementStock[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const eid = entreprise?.entreprise_id;
  const cle = `${eid}|${articleId}|${boutiqueId}`;

  useEffect(() => {
    if (!eid) return;
    let actif = true;
    chargerMouvements(supabase, eid, { articleId: articleId || undefined, boutiqueId: boutiqueId || undefined, limite: 300 })
      .then((mouvements) => actif && setResultat({ cle, mouvements }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [eid, articleId, boutiqueId, cle]);

  function filtrer(champ: "article" | "boutique", valeur: string) {
    const p = new URLSearchParams(params.toString());
    if (valeur) p.set(champ, valeur);
    else p.delete(champ);
    router.replace(`/stock/mouvements${p.size ? `?${p}` : ""}`);
  }

  const mouvements = resultat?.cle === cle ? resultat.mouvements : null;
  const unArticle = articleId ? articleParId.get(articleId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1 sm:max-w-80">
          <ChoixArticleStock articles={articles} valeur={articleId} onChange={(id) => filtrer("article", id)} />
        </div>
        <Liste aria-label="Boutique" className="w-auto min-w-48" value={boutiqueId} onChange={(e) => filtrer("boutique", e.target.value)}>
          <option value="">Toutes les boutiques</option>
          {boutiques.map((b) => (
            <option key={b.id} value={b.id}>{b.nom}</option>
          ))}
        </Liste>
        {(articleId || boutiqueId) && (
          <button className="text-sm text-muted hover:text-foreground" onClick={() => router.replace("/stock/mouvements")}>
            Effacer les filtres
          </button>
        )}
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}

      <Carte>
        {!mouvements ? (
          <Chargement />
        ) : mouvements.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Aucun mouvement.</p>
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  {!unArticle && <th className="px-2 py-2.5 font-medium">Article</th>}
                  <th className="px-2 py-2.5 font-medium">Boutique</th>
                  <th className="px-2 py-2.5 font-medium">Mouvement</th>
                  <th className="px-2 py-2.5 font-medium">Origine</th>
                  <th className="px-2 py-2.5 text-right font-medium">Quantité</th>
                  <th className="px-2 py-2.5 text-right font-medium">Coût unit.</th>
                  <th className="px-2 py-2.5 text-right font-medium">Valeur</th>
                  <th className="px-5 py-2.5 text-right font-medium">Stock après</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mouvements.map((m) => (
                  <tr key={m.id} className="hover:bg-background">
                    <td className="whitespace-nowrap px-5 py-3">{formaterDate(m.date_mouvement)}</td>
                    {!unArticle && <td className="px-2 py-3 font-medium">{m.articles?.designation}</td>}
                    <td className="px-2 py-3">{boutiqueParId.get(m.boutique_id)?.nom}</td>
                    <td className="whitespace-nowrap px-2 py-3">{LIBELLES_MOUVEMENTS[m.type]}</td>
                    <td className="max-w-56 truncate px-2 py-3"><Origine m={m} /></td>
                    <td className="px-2 py-3 text-right"><QuantiteSignee valeur={m.quantite} /></td>
                    <td className="px-2 py-3 text-right"><Montant valeur={m.cout_unitaire} /></td>
                    <td className={`px-2 py-3 text-right ${m.valeur < 0 ? "text-danger" : ""}`}>
                      <Montant valeur={m.valeur} />
                    </td>
                    <td className="montant whitespace-nowrap px-5 py-3 text-right">
                      {formaterQuantite(m.quantite_apres)}
                      <span className="ml-1 text-xs text-muted">{m.articles?.unite}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
      {mouvements && mouvements.length >= 300 && (
        <p className="text-xs text-muted">Seuls les 300 derniers mouvements sont affichés : filtrez par article ou boutique.</p>
      )}
    </div>
  );
}
