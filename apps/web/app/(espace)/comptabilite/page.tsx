"use client";

import {
  chargerEcritures,
  contrePasserEcriture,
  formaterDate,
  supprimerBrouillon,
  validerEcriture,
  type Ecriture,
} from "@facturall/core";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useState } from "react";

import { Montant } from "@/components/compta";
import { Alerte, Badge, Bouton, Carte, Chargement, LienBouton, Liste } from "@/components/ui";
import { useCompta } from "@/lib/compta";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

export default function PageEcritures() {
  return (
    <Suspense fallback={<Chargement />}>
      <Ecritures />
    </Suspense>
  );
}

function Ecritures() {
  const { entreprise } = useEspace();
  const { exercice, journaux, journalParId, compteParId, peutSaisir } = useCompta();
  const statutInitial = useSearchParams().get("statut");
  const [journalId, setJournalId] = useState("");
  const [statut, setStatut] = useState<"" | "brouillon" | "validee">(
    statutInitial === "brouillon" || statutInitial === "validee" ? statutInitial : "",
  );
  const [ecritures, setEcritures] = useState<Ecriture[] | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!entreprise || !exercice) return;
    try {
      setEcritures(
        await chargerEcritures(supabase, entreprise.entreprise_id, {
          exerciceId: exercice.id,
          journalId: journalId || undefined,
          statut: statut || undefined,
          limite: 200,
        }),
      );
    } catch (e) {
      setErreur((e as Error).message);
    }
  }, [entreprise, exercice, journalId, statut]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  async function agir(id: string, fn: () => Promise<unknown>, succes: string) {
    setErreur(null);
    setMessage(null);
    setAction(id);
    try {
      await fn();
      setMessage(succes);
      await charger();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setAction(null);
    }
  }

  if (!exercice) return <Alerte>Aucun exercice comptable.</Alerte>;
  const contrePassees = new Set((ecritures ?? []).map((e) => e.contre_passation_de).filter(Boolean));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Liste aria-label="Journal" value={journalId} onChange={(e) => setJournalId(e.target.value)} className="w-auto">
          <option value="">Tous les journaux</option>
          {journaux.map((j) => (
            <option key={j.id} value={j.id}>
              {j.code} — {j.libelle}
            </option>
          ))}
        </Liste>
        <Liste
          aria-label="Statut"
          value={statut}
          onChange={(e) => setStatut(e.target.value as typeof statut)}
          className="w-auto"
        >
          <option value="">Tous les statuts</option>
          <option value="validee">Validées</option>
          <option value="brouillon">Brouillons</option>
        </Liste>
        {peutSaisir && (
          <div className="ml-auto flex gap-2">
            <LienBouton href="/comptabilite/operation" variante="secondaire">
              Recette / dépense
            </LienBouton>
            <LienBouton href="/comptabilite/saisie">Nouvelle écriture</LienBouton>
          </div>
        )}
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}
      {message && <Alerte type="succes">{message}</Alerte>}

      <Carte>
        {!ecritures ? (
          <Chargement />
        ) : ecritures.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Aucune écriture.{" "}
            {peutSaisir && (
              <Link href="/comptabilite/operation" className="text-primary hover:underline">
                Enregistrez votre première recette ou dépense.
              </Link>
            )}
          </p>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b border-border bg-surface-retrait text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-2 py-2.5 font-medium">N°</th>
                  <th className="px-2 py-2.5 font-medium">Libellé</th>
                  <th className="px-2 py-2.5 font-medium">Pièce</th>
                  <th className="px-5 py-2.5 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ecritures.map((e) => (
                  <Fragment key={e.id}>
                    <tr
                      className="cursor-pointer hover:bg-surface-retrait"
                      onClick={() => setOuverte((o) => (o === e.id ? null : e.id))}
                      aria-expanded={ouverte === e.id}
                    >
                      <td className="whitespace-nowrap px-5 py-3">{formaterDate(e.date_ecriture)}</td>
                      <td className="whitespace-nowrap px-2 py-3 font-mono text-xs">
                        {e.numero ?? <Badge ton="gris">Brouillon</Badge>}
                      </td>
                      <td className="px-2 py-3">
                        <span className="font-medium">{e.libelle}</span>
                        <span className="ml-2 text-xs text-muted">{journalParId.get(e.journal_id)?.code}</span>
                        {e.contre_passation_de && <Badge ton="gris">Annulation</Badge>}
                        {contrePassees.has(e.id) && <span className="ml-2 text-xs text-muted">(annulée)</span>}
                      </td>
                      <td className="px-2 py-3 text-muted">{e.reference}</td>
                      <td className="px-5 py-3 text-right font-medium">
                        <Montant valeur={e.statut === "validee" ? e.total : (e.ecriture_lignes ?? []).reduce((s, l) => s + l.debit, 0)} />
                      </td>
                    </tr>
                    {ouverte === e.id && (
                      <tr className="bg-background/60">
                        <td colSpan={5} className="px-5 pb-4 pt-1">
                          <table className="w-full text-sm">
                            <tbody>
                              {(e.ecriture_lignes ?? []).map((l) => {
                                const c = compteParId.get(l.compte_id);
                                return (
                                  <tr key={l.id}>
                                    <td className="w-20 py-1 font-mono text-xs text-muted">{c?.numero}</td>
                                    <td className={`py-1 ${l.credit ? "pl-6" : ""}`}>{l.libelle || c?.libelle}</td>
                                    <td className="w-32 py-1 text-right"><Montant valeur={l.debit} /></td>
                                    <td className="w-32 py-1 text-right"><Montant valeur={l.credit} /></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {peutSaisir && (
                            <div className="mt-3 flex flex-wrap justify-end gap-2">
                              {e.statut === "brouillon" ? (
                                <>
                                  <Bouton
                                    variante="danger"
                                    className="h-8"
                                    chargement={action === e.id + "suppr"}
                                    onClick={() => {
                                      if (confirm("Supprimer ce brouillon ?"))
                                        void agir(e.id + "suppr", () => supprimerBrouillon(supabase, e.id), "Brouillon supprimé.");
                                    }}
                                  >
                                    Supprimer
                                  </Bouton>
                                  <LienBouton href={`/comptabilite/saisie?brouillon=${e.id}`} variante="secondaire" className="h-8">
                                    Modifier
                                  </LienBouton>
                                  <Bouton
                                    className="h-8"
                                    chargement={action === e.id + "valider"}
                                    onClick={() =>
                                      void agir(e.id + "valider", () => validerEcriture(supabase, e.id), "Écriture validée.")
                                    }
                                  >
                                    Valider
                                  </Bouton>
                                </>
                              ) : (
                                !e.contre_passation_de &&
                                !contrePassees.has(e.id) && (
                                  <Bouton
                                    variante="secondaire"
                                    className="h-8"
                                    chargement={action === e.id + "cp"}
                                    onClick={() => {
                                      if (confirm(`Annuler l'écriture ${e.numero} par une écriture inverse datée d'aujourd'hui ?`))
                                        void agir(e.id + "cp", () => contrePasserEcriture(supabase, e.id), "Écriture contre-passée.");
                                    }}
                                  >
                                    Contre-passer
                                  </Bouton>
                                )
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
      {ecritures && ecritures.length >= 200 && (
        <p className="text-xs text-muted">Affichage limité aux 200 écritures les plus récentes : filtrez par journal.</p>
      )}
    </div>
  );
}
