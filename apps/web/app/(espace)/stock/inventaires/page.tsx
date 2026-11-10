"use client";

import { chargerInventaires, formaterDate, type Inventaire } from "@facturall/core";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Montant } from "@/components/compta";
import { Alerte, Badge, Carte, Chargement, LienBouton } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { useStock } from "@/lib/stock";
import { supabase } from "@/lib/supabase";

export default function PageInventaires() {
  const { entreprise } = useEspace();
  const { peutGerer, boutiqueParId } = useStock();
  const [resultat, setResultat] = useState<{ cle: string; inventaires: Inventaire[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const eid = entreprise?.entreprise_id;
  const cle = `${eid}`;
  useEffect(() => {
    if (!eid) return;
    let actif = true;
    chargerInventaires(supabase, eid)
      .then((inventaires) => actif && setResultat({ cle, inventaires }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [eid, cle]);

  const inventaires = resultat?.cle === cle ? resultat.inventaires : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          Comptez la marchandise présente en boutique : à la validation, le stock est ramené aux quantités comptées et
          les écarts sont valorisés au CMUP.
        </p>
        {peutGerer && <LienBouton className="ml-auto" href="/stock/inventaire">Nouvel inventaire</LienBouton>}
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}

      <Carte>
        {!inventaires ? (
          <Chargement />
        ) : inventaires.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Aucun inventaire.{" "}
            {peutGerer && <Link href="/stock/inventaire" className="text-primary hover:underline">Commencer un comptage</Link>}
          </p>
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">N°</th>
                  <th className="px-2 py-2.5 font-medium">Date</th>
                  <th className="px-2 py-2.5 font-medium">Boutique</th>
                  <th className="px-2 py-2.5 font-medium">État</th>
                  <th className="px-5 py-2.5 text-right font-medium">Écart valorisé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventaires.map((i) => (
                  <tr key={i.id} className="hover:bg-background">
                    <td className="px-5 py-3 font-mono text-xs">
                      <Link href={`/stock/inventaire?id=${i.id}`} className="font-medium text-primary hover:underline">
                        {i.numero ?? "Brouillon"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">{formaterDate(i.date_inventaire)}</td>
                    <td className="px-2 py-3">{boutiqueParId.get(i.boutique_id)?.nom}</td>
                    <td className="px-2 py-3">
                      {i.statut === "valide" ? <Badge ton="vert">Validé</Badge> : <Badge ton="gris">Brouillon</Badge>}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium ${i.ecart_valeur < 0 ? "text-danger" : ""}`}>
                      {i.statut === "valide" ? <Montant valeur={i.ecart_valeur} /> : ""}
                    </td>
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
