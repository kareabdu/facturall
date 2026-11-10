"use client";

import { chargerReleves, formaterDate, LIBELLES_SOURCES, TYPES_TRESORERIE, type ReleveBancaire } from "@facturall/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MontantSigne } from "@/components/rapprochement";
import { Alerte, Badge, Carte, Chargement, LienBouton, Segments } from "@/components/ui";
import { useCompta } from "@/lib/compta";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

export default function PageRapprochement() {
  const { entreprise } = useEspace();
  const { journaux, journalParId, peutSaisir } = useCompta();
  const tresoreries = useMemo(() => journaux.filter((j) => TYPES_TRESORERIE.includes(j.type)), [journaux]);
  const [filtre, setFiltre] = useState<string>("tous");
  const [resultat, setResultat] = useState<{ cle: string; releves: ReleveBancaire[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const eid = entreprise?.entreprise_id;
  const cle = `${eid}`;
  useEffect(() => {
    if (!eid) return;
    let actif = true;
    chargerReleves(supabase, eid)
      .then((releves) => actif && setResultat({ cle, releves }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [eid, cle]);

  const tous = resultat?.cle === cle ? resultat.releves : null;
  const releves = tous?.filter((r) => filtre === "tous" || r.journal_id === filtre) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Importez le relevé de la banque (PDF, Excel, CSV) ou saisissez-le, puis pointez chaque opération avec la comptabilité.
          Les frais et agios connus seulement de la banque se comptabilisent directement depuis le relevé.
        </p>
        {peutSaisir && (
          <LienBouton className="ml-auto" href="/comptabilite/rapprochement/releve">
            Nouveau relevé
          </LienBouton>
        )}
      </div>

      {tresoreries.length > 1 && (
        <Segments
          libelle="Compte"
          options={[{ valeur: "tous", libelle: "Tous" }, ...tresoreries.map((j) => ({ valeur: j.id, libelle: j.libelle }))]}
          valeur={filtre}
          onChange={setFiltre}
        />
      )}

      {erreur && <Alerte>{erreur}</Alerte>}

      <Carte>
        {!releves ? (
          <Chargement />
        ) : releves.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Aucun relevé.{" "}
            {peutSaisir && (
              <Link href="/comptabilite/rapprochement/releve" className="text-primary hover:underline">
                Importer le premier relevé
              </Link>
            )}
          </p>
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-border bg-surface-retrait text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Relevé</th>
                  <th className="px-2 py-2.5 font-medium">Compte</th>
                  <th className="px-2 py-2.5 font-medium">Période</th>
                  <th className="px-2 py-2.5 font-medium">Pointage</th>
                  <th className="px-2 py-2.5 text-right font-medium">Solde final</th>
                  <th className="px-5 py-2.5 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {releves.map((r) => {
                  const lignes = r.lignes_releve ?? [];
                  const pointees = lignes.filter((l) => l.ecriture_ligne_id).length;
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-retrait">
                      <td className="px-5 py-3">
                        <Link href={`/comptabilite/rapprochement/releve?id=${r.id}`} className="font-medium hover:text-primary">
                          {r.numero ?? "Brouillon"}
                        </Link>
                        <p className="text-xs text-muted">{r.fichier ?? LIBELLES_SOURCES[r.source]}</p>
                      </td>
                      <td className="px-2 py-3">{journalParId.get(r.journal_id)?.libelle}</td>
                      <td className="px-2 py-3 whitespace-nowrap">
                        {formaterDate(r.date_debut)} → {formaterDate(r.date_fin)}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-retrait">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${lignes.length ? (pointees / lignes.length) * 100 : 100}%` }}
                            />
                          </div>
                          <span className="montant text-xs text-muted">
                            {pointees}/{lignes.length}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <MontantSigne valeur={r.solde_final} />
                      </td>
                      <td className="px-5 py-3">
                        {r.statut === "valide" ? <Badge ton="vert">Rapproché</Badge> : <Badge ton="orange">En cours</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </div>
  );
}
