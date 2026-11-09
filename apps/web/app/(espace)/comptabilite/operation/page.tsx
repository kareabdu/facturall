"use client";

import {
  aujourdhui,
  categoriesOperation,
  chargerEcritures,
  enregistrerOperationSimple,
  formaterDate,
  formaterXOF,
  TYPES_TRESORERIE,
  type Ecriture,
} from "@facturall/core";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { ChampMontant, ChoixCompte } from "@/components/compta";
import { Alerte, Bouton, Carte, Champ, Liste } from "@/components/ui";
import { useCompta } from "@/lib/compta";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

type Sens = "recette" | "depense";

/** Mode simplifié : une recette ou une dépense, sans notion de débit/crédit. */
export default function PageOperation() {
  const { entreprise, boutique } = useEspace();
  const { comptes, journaux, compteParId, journalParId, peutSaisir } = useCompta();
  const tresoreries = journaux.filter((j) => j.actif && TYPES_TRESORERIE.includes(j.type));

  const [sens, setSens] = useState<Sens>("depense");
  const [date, setDate] = useState(aujourdhui());
  const [montant, setMontant] = useState(0);
  const [journalId, setJournalId] = useState(() => tresoreries.find((j) => j.type === "caisse")?.id ?? "");
  const [compteId, setCompteId] = useState("");
  const [libelle, setLibelle] = useState("");
  const [reference, setReference] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [recentes, setRecentes] = useState<Ecriture[]>([]);

  const categories = useMemo(() => categoriesOperation(comptes, sens), [comptes, sens]);

  const chargerRecentes = useCallback(async () => {
    if (!entreprise) return;
    const liste = await chargerEcritures(supabase, entreprise.entreprise_id, { limite: 30 });
    setRecentes(liste.filter((e) => e.origine === "simple").slice(0, 10));
  }, [entreprise]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void chargerRecentes().catch(() => {});
  }, [chargerRecentes]);

  if (!peutSaisir || !entreprise) return <Alerte>Saisie réservée à la comptabilité.</Alerte>;

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!entreprise) return;
    const invalide =
      (montant <= 0 ? "Saisissez un montant." : null) ??
      (!journalId ? "Choisissez la caisse, la banque ou le compte Mobile Money." : null) ??
      (!compteId ? "Choisissez une catégorie." : null) ??
      (!libelle.trim() ? "Décrivez l'opération (libellé)." : null);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setMessage(null);
    setEnvoi(true);
    try {
      await enregistrerOperationSimple(supabase, {
        entrepriseId: entreprise.entreprise_id,
        sens,
        date,
        montant,
        journalId,
        compteId,
        libelle: libelle.trim(),
        reference: reference.trim() || null,
        boutiqueId: boutique?.id ?? null,
      });
      setMessage(`${sens === "recette" ? "Recette" : "Dépense"} de ${formaterXOF(montant)} enregistrée.`);
      setMontant(0);
      setLibelle("");
      setReference("");
      await chargerRecentes();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <Carte titre="Nouvelle opération">
        <form onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
          <div role="radiogroup" aria-label="Type d'opération" className="grid grid-cols-2 gap-2 rounded-xl bg-background p-1">
            {(["recette", "depense"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sens === s}
                onClick={() => {
                  setSens(s);
                  setCompteId("");
                }}
                className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                  sens === s ? (s === "recette" ? "bg-primary text-white" : "bg-foreground text-white") : "text-muted"
                }`}
              >
                {s === "recette" ? "Recette (entrée d'argent)" : "Dépense (sortie d'argent)"}
              </button>
            ))}
          </div>

          {erreur && <Alerte>{erreur}</Alerte>}
          {message && <Alerte type="succes">{message}</Alerte>}

          <div className="grid gap-4 sm:grid-cols-2">
            <ChampMontant libelle="Montant (FCFA)" valeur={montant} onChange={setMontant} />
            <Champ libelle="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <Liste
            libelle={sens === "recette" ? "Encaissé sur" : "Payé depuis"}
            value={journalId}
            onChange={(e) => setJournalId(e.target.value)}
          >
            <option value="">Choisir…</option>
            {tresoreries.map((j) => (
              <option key={j.id} value={j.id}>
                {j.libelle} ({compteParId.get(j.compte_tresorerie_id ?? "")?.numero})
              </option>
            ))}
          </Liste>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Catégorie</span>
            <ChoixCompte
              comptes={categories}
              valeur={compteId}
              onChange={setCompteId}
              placeholder={sens === "recette" ? "Ex. : 701 Ventes de marchandises" : "Ex. : 6052 Électricité, 622 Loyer…"}
              ariaLabel="Catégorie"
            />
            <span className="text-xs text-muted">
              {sens === "recette"
                ? "Comptes de produits (classe 7) et assimilés."
                : "Comptes de charges (classe 6), immobilisations (classe 2) et tiers."}
            </span>
          </div>

          <Champ
            libelle="Libellé"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder={sens === "recette" ? "Ex. : Ventes comptoir du jour" : "Ex. : Facture SENELEC octobre"}
            required
          />
          <Champ libelle="N° de pièce (facture, reçu…)" value={reference} onChange={(e) => setReference(e.target.value)} />

          <div className="flex justify-end">
            <Bouton type="submit" chargement={envoi}>
              Enregistrer
            </Bouton>
          </div>
        </form>
      </Carte>

      <Carte titre="Dernières opérations">
        {recentes.length === 0 ? (
          <p className="text-sm text-muted">Aucune opération pour l&apos;instant.</p>
        ) : (
          <ul className="-my-2 divide-y divide-border text-sm">
            {recentes.map((e) => {
              const tresorerie = journalParId.get(e.journal_id)?.compte_tresorerie_id;
              const entree = e.ecriture_lignes?.some((l) => l.compte_id === tresorerie && l.debit > 0);
              return (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.libelle}</p>
                    <p className="text-xs text-muted">
                      {formaterDate(e.date_ecriture)} · {journalParId.get(e.journal_id)?.libelle} · {e.numero}
                    </p>
                  </div>
                  <span className={`montant font-semibold ${entree ? "text-primary" : ""}`}>
                    {entree ? "+" : "−"}
                    {formaterXOF(e.total)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Carte>
    </div>
  );
}
