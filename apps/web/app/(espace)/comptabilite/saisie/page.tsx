"use client";

import {
  aujourdhui,
  chargerEcritures,
  enregistrerEcriture,
  formaterXOF,
  totauxLignes,
  verifierLignes,
  type LigneSaisie,
} from "@facturall/core";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";

import { ChampMontant, ChoixCompte } from "@/components/compta";
import { Alerte, Bouton, Carte, Champ, Chargement, Liste } from "@/components/ui";
import { useCompta } from "@/lib/compta";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

const ligneVide = (): LigneSaisie => ({ compte_id: "", libelle: "", debit: 0, credit: 0 });

export default function PageSaisie() {
  return (
    <Suspense fallback={<Chargement />}>
      <Saisie />
    </Suspense>
  );
}

/** Saisie en partie double (mode avancé). ?brouillon=<id> pour reprendre un brouillon. */
function Saisie() {
  const { entreprise, boutique } = useEspace();
  const { comptes, journaux, peutSaisir } = useCompta();
  const router = useRouter();
  const brouillonId = useSearchParams().get("brouillon");
  const comptesSaisissables = useMemo(() => comptes.filter((c) => c.actif && c.mouvementable), [comptes]);
  const journauxActifs = journaux.filter((j) => j.actif);

  const [journalId, setJournalId] = useState(() => journauxActifs.find((j) => j.code === "OD")?.id ?? "");
  const [date, setDate] = useState(aujourdhui());
  const [libelle, setLibelle] = useState("");
  const [reference, setReference] = useState("");
  const [lignes, setLignes] = useState<LigneSaisie[]>([ligneVide(), ligneVide()]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<"brouillon" | "valider" | null>(null);
  const [chargementBrouillon, setChargementBrouillon] = useState(!!brouillonId);

  // Reprise d'un brouillon
  useEffect(() => {
    if (!brouillonId || !entreprise) return;
    chargerEcritures(supabase, entreprise.entreprise_id, { statut: "brouillon", limite: 500 })
      .then((liste) => {
        const e = liste.find((x) => x.id === brouillonId);
        if (!e) return setErreur("Brouillon introuvable (il a peut-être été validé ou supprimé).");
        setJournalId(e.journal_id);
        setDate(e.date_ecriture);
        setLibelle(e.libelle);
        setReference(e.reference ?? "");
        setLignes(
          (e.ecriture_lignes ?? []).map((l) => ({
            compte_id: l.compte_id,
            libelle: l.libelle ?? "",
            debit: l.debit,
            credit: l.credit,
          })),
        );
      })
      .catch((err: Error) => setErreur(err.message))
      .finally(() => setChargementBrouillon(false));
  }, [brouillonId, entreprise]);

  const totaux = totauxLignes(lignes);

  if (!peutSaisir || !entreprise) return <Alerte>Saisie réservée à la comptabilité.</Alerte>;
  if (chargementBrouillon) return <Chargement texte="Chargement du brouillon…" />;

  const maj = (i: number, champs: Partial<LigneSaisie>) =>
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...champs } : l)));

  /** Équilibre automatiquement la dernière ligne vide. */
  function equilibrer() {
    const ecart = totaux.ecart;
    if (!ecart) return;
    const i = lignes.findIndex((l) => !l.debit && !l.credit);
    const ligne = ecart > 0 ? { debit: 0, credit: ecart } : { debit: -ecart, credit: 0 };
    if (i >= 0) maj(i, ligne);
    else setLignes((ls) => [...ls, { ...ligneVide(), ...ligne }]);
  }

  async function soumettre(valider: boolean, e?: FormEvent) {
    e?.preventDefault();
    if (!entreprise) return;
    const invalide =
      (!journalId ? "Choisissez un journal." : null) ??
      (!libelle.trim() ? "Saisissez un libellé." : null) ??
      verifierLignes(lignes) ??
      (valider && !totaux.equilibree
        ? `L'écriture n'est pas équilibrée (écart de ${formaterXOF(Math.abs(totaux.ecart))}).`
        : null);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEnvoi(valider ? "valider" : "brouillon");
    try {
      await enregistrerEcriture(supabase, {
        entrepriseId: entreprise.entreprise_id,
        journalId,
        date,
        libelle: libelle.trim(),
        reference: reference.trim() || null,
        lignes,
        valider,
        boutiqueId: boutique?.id ?? null,
        ecritureId: brouillonId,
      });
      router.push(valider ? "/comptabilite" : "/comptabilite?statut=brouillon");
    } catch (err) {
      setErreur((err as Error).message);
      setEnvoi(null);
    }
  }

  return (
    <form onSubmit={(e) => void soumettre(true, e)} noValidate className="flex flex-col gap-6">
      <Carte titre={brouillonId ? "Modifier le brouillon" : "Nouvelle écriture"}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Liste libelle="Journal" value={journalId} onChange={(e) => setJournalId(e.target.value)} required>
            <option value="">Choisir…</option>
            {journauxActifs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} — {j.libelle}
              </option>
            ))}
          </Liste>
          <Champ libelle="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Champ
            libelle="Libellé"
            className="lg:col-span-1"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Ex. : Facture fournisseur F-0012"
            required
          />
          <Champ libelle="N° de pièce" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </Carte>

      <Carte titre="Lignes">
        {erreur && (
          <div className="mb-4">
            <Alerte>{erreur}</Alerte>
          </div>
        )}
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Compte</th>
                <th className="pb-2 pl-2 font-medium">Libellé de ligne</th>
                <th className="w-36 pb-2 pl-2 text-right font-medium">Débit</th>
                <th className="w-36 pb-2 pl-2 text-right font-medium">Crédit</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1">
                    <ChoixCompte
                      comptes={comptesSaisissables}
                      valeur={l.compte_id}
                      onChange={(id) => maj(i, { compte_id: id })}
                      ariaLabel={`Compte ligne ${i + 1}`}
                    />
                  </td>
                  <td className="py-1 pl-2">
                    <input
                      aria-label={`Libellé ligne ${i + 1}`}
                      className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      value={l.libelle ?? ""}
                      placeholder={libelle}
                      onChange={(e) => maj(i, { libelle: e.target.value })}
                    />
                  </td>
                  <td className="py-1 pl-2">
                    <ChampMontant
                      ariaLabel={`Débit ligne ${i + 1}`}
                      valeur={l.debit}
                      onChange={(v) => maj(i, { debit: v, credit: v ? 0 : l.credit })}
                    />
                  </td>
                  <td className="py-1 pl-2">
                    <ChampMontant
                      ariaLabel={`Crédit ligne ${i + 1}`}
                      valeur={l.credit}
                      onChange={(v) => maj(i, { credit: v, debit: v ? 0 : l.debit })}
                    />
                  </td>
                  <td className="py-1 pl-1">
                    <button
                      type="button"
                      aria-label={`Supprimer la ligne ${i + 1}`}
                      disabled={lignes.length <= 2}
                      onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}
                      className="grid size-10 place-items-center rounded-lg text-muted hover:bg-surface-retrait hover:text-danger disabled:opacity-30"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="pt-3" colSpan={2}>
                  <div className="flex flex-wrap gap-2">
                    <Bouton type="button" variante="secondaire" className="h-8" onClick={() => setLignes((ls) => [...ls, ligneVide()])}>
                      + Ligne
                    </Bouton>
                    {totaux.ecart !== 0 && (
                      <Bouton type="button" variante="discret" className="h-8" onClick={equilibrer}>
                        Équilibrer
                      </Bouton>
                    )}
                  </div>
                </td>
                <td className="montant pl-2 pt-3 text-right">{formaterXOF(totaux.debit, { symbole: false })}</td>
                <td className="montant pl-2 pt-3 text-right">{formaterXOF(totaux.credit, { symbole: false })}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} className="pt-2 text-right text-sm">
                  {totaux.equilibree ? (
                    <span className="font-medium text-primary">✓ Écriture équilibrée</span>
                  ) : totaux.debit || totaux.credit ? (
                    <span className="font-medium text-danger">
                      Écart : {formaterXOF(Math.abs(totaux.ecart))} {totaux.ecart > 0 ? "au débit" : "au crédit"}
                    </span>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Carte>

      <div className="flex flex-wrap justify-end gap-3">
        <Bouton type="button" variante="secondaire" onClick={() => router.push("/comptabilite")}>
          Annuler
        </Bouton>
        <Bouton type="button" variante="secondaire" chargement={envoi === "brouillon"} onClick={() => void soumettre(false)}>
          Enregistrer en brouillon
        </Bouton>
        <Bouton type="submit" chargement={envoi === "valider"} disabled={!totaux.equilibree}>
          Valider l&apos;écriture
        </Bouton>
      </div>
      <p className="-mt-3 text-right text-xs text-muted">
        Une écriture validée reçoit son numéro définitif et ne peut plus être modifiée ; pour la corriger, on la contre-passe.
      </p>
    </form>
  );
}
