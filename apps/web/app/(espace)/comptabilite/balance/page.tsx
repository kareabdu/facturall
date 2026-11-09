"use client";

import {
  balanceEnCSV,
  chargerBalance,
  chargerGrandLivre,
  CLASSES_SYSCOHADA,
  formaterDate,
  formaterXOF,
  type LigneBalance,
  type LigneGrandLivre,
} from "@facturall/core";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { Montant } from "@/components/compta";
import { Alerte, Bouton, Carte, Champ, Chargement } from "@/components/ui";
import { useCompta } from "@/lib/compta";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

export default function PageBalance() {
  const { entreprise } = useEspace();
  const { exercice } = useCompta();
  const [dateFin, setDateFin] = useState("");
  const [lignes, setLignes] = useState<LigneBalance[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [compteOuvert, setCompteOuvert] = useState<string | null>(null);
  const [grandLivre, setGrandLivre] = useState<LigneGrandLivre[] | null>(null);

  const charger = useCallback(async () => {
    if (!entreprise || !exercice) return;
    try {
      setLignes(await chargerBalance(supabase, entreprise.entreprise_id, exercice.id, dateFin || null));
      setErreur(null);
    } catch (e) {
      setErreur((e as Error).message);
    }
  }, [entreprise, exercice, dateFin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
    setCompteOuvert(null);
  }, [charger]);

  async function ouvrir(compteId: string) {
    if (!entreprise || !exercice) return;
    if (compteOuvert === compteId) return setCompteOuvert(null);
    setCompteOuvert(compteId);
    setGrandLivre(null);
    try {
      setGrandLivre(await chargerGrandLivre(supabase, entreprise.entreprise_id, compteId, exercice.id, dateFin || null));
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  const parClasse = useMemo(() => {
    const groupes = new Map<number, LigneBalance[]>();
    for (const l of lignes ?? []) groupes.set(l.classe, [...(groupes.get(l.classe) ?? []), l]);
    return [...groupes.entries()].sort(([a], [b]) => a - b);
  }, [lignes]);

  const total = useMemo(() => {
    const t = { debit: 0, credit: 0, sd: 0, sc: 0 };
    for (const l of lignes ?? []) {
      t.debit += l.total_debit;
      t.credit += l.total_credit;
      t.sd += l.solde_debiteur;
      t.sc += l.solde_crediteur;
    }
    return t;
  }, [lignes]);

  /** Résultat provisoire : produits (7, 8x produits) − charges (6, 8x charges) */
  const resultat = useMemo(() => {
    let r = 0;
    for (const l of lignes ?? []) if (l.classe >= 6 && l.classe <= 8) r += l.solde_crediteur - l.solde_debiteur;
    return r;
  }, [lignes]);

  function exporter() {
    if (!lignes || !exercice) return;
    // BOM UTF-8 pour qu'Excel affiche correctement les accents
    const blob = new Blob(["﻿" + balanceEnCSV(lignes)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `balance-${exercice.code}${dateFin ? "-au-" + dateFin : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!exercice) return <Alerte>Aucun exercice comptable.</Alerte>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Champ
          libelle="Arrêtée au"
          type="date"
          value={dateFin}
          min={exercice.date_debut}
          max={exercice.date_fin}
          onChange={(e) => setDateFin(e.target.value)}
          aide={dateFin ? undefined : "Vide = toutes les écritures de l'exercice"}
        />
        <div className="ml-auto flex gap-2">
          <Bouton variante="secondaire" onClick={exporter} disabled={!lignes?.length}>
            Exporter (CSV / Excel)
          </Bouton>
        </div>
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}

      {lignes && lignes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">Total des mouvements</p>
            <p className="montant mt-1 text-lg font-semibold">{formaterXOF(total.debit)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">Contrôle d&apos;équilibre</p>
            <p className={`mt-1 text-lg font-semibold ${total.debit === total.credit ? "text-primary" : "text-danger"}`}>
              {total.debit === total.credit ? "✓ Débit = crédit" : "Déséquilibre !"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">Résultat provisoire (classes 6 à 8)</p>
            <p className={`montant mt-1 text-lg font-semibold ${resultat < 0 ? "text-danger" : "text-primary"}`}>
              {resultat >= 0 ? "Bénéfice " : "Perte "}
              {formaterXOF(Math.abs(resultat))}
            </p>
          </div>
        </div>
      )}

      <Carte>
        {!lignes ? (
          <Chargement />
        ) : lignes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Aucune écriture validée sur cette période.</p>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Compte</th>
                  <th className="px-2 py-2.5 font-medium">Intitulé</th>
                  <th className="px-2 py-2.5 text-right font-medium">Débit</th>
                  <th className="px-2 py-2.5 text-right font-medium">Crédit</th>
                  <th className="px-2 py-2.5 text-right font-medium">Solde débiteur</th>
                  <th className="px-5 py-2.5 text-right font-medium">Solde créditeur</th>
                </tr>
              </thead>
              <tbody>
                {parClasse.map(([classe, comptes]) => (
                  <Fragment key={classe}>
                    <tr className="border-t border-border bg-background/50">
                      <td colSpan={6} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        Classe {classe} — {CLASSES_SYSCOHADA[classe]}
                      </td>
                    </tr>
                    {comptes.map((l) => (
                      <Fragment key={l.compte_id}>
                        <tr
                          className="cursor-pointer border-t border-border/60 hover:bg-background"
                          onClick={() => void ouvrir(l.compte_id)}
                          aria-expanded={compteOuvert === l.compte_id}
                          title="Afficher le grand livre du compte"
                        >
                          <td className="px-5 py-2 font-mono text-xs">{l.numero}</td>
                          <td className="px-2 py-2">{l.libelle}</td>
                          <td className="px-2 py-2 text-right"><Montant valeur={l.total_debit} /></td>
                          <td className="px-2 py-2 text-right"><Montant valeur={l.total_credit} /></td>
                          <td className="px-2 py-2 text-right font-medium"><Montant valeur={l.solde_debiteur} /></td>
                          <td className="px-5 py-2 text-right font-medium"><Montant valeur={l.solde_crediteur} /></td>
                        </tr>
                        {compteOuvert === l.compte_id && (
                          <tr className="bg-primary-soft/40">
                            <td colSpan={6} className="px-5 py-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                                Grand livre — {l.numero} {l.libelle}
                              </p>
                              {!grandLivre ? (
                                <Chargement />
                              ) : (
                                <table className="w-full text-xs">
                                  <thead className="text-left text-muted">
                                    <tr>
                                      <th className="py-1 font-medium">Date</th>
                                      <th className="py-1 font-medium">N°</th>
                                      <th className="py-1 font-medium">Libellé</th>
                                      <th className="py-1 text-right font-medium">Débit</th>
                                      <th className="py-1 text-right font-medium">Crédit</th>
                                      <th className="py-1 text-right font-medium">Solde</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {grandLivre.map((g, i) => (
                                      <tr key={g.ecriture_id + i}>
                                        <td className="py-1">{formaterDate(g.date_ecriture)}</td>
                                        <td className="py-1 font-mono">{g.numero}</td>
                                        <td className="py-1">{g.libelle}</td>
                                        <td className="py-1 text-right"><Montant valeur={g.debit} /></td>
                                        <td className="py-1 text-right"><Montant valeur={g.credit} /></td>
                                        <td className="py-1 text-right font-medium">
                                          <span className="montant">
                                            {formaterXOF(Math.abs(g.solde), { symbole: false })} {g.solde >= 0 ? "D" : "C"}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-foreground/20 font-semibold">
                <tr>
                  <td className="px-5 py-3" colSpan={2}>Totaux</td>
                  <td className="px-2 py-3 text-right"><Montant valeur={total.debit} /></td>
                  <td className="px-2 py-3 text-right"><Montant valeur={total.credit} /></td>
                  <td className="px-2 py-3 text-right"><Montant valeur={total.sd} /></td>
                  <td className="px-5 py-3 text-right"><Montant valeur={total.sc} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Carte>
    </div>
  );
}
