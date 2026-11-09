"use client";

import {
  aujourdhui,
  chargerBalance,
  chargerExercices,
  formaterXOF,
  LIBELLES_ROLES,
  nomPays,
  peutLireCompta,
} from "@facturall/core";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge, Carte, EnTetePage } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const INDICATEURS = ["Ventes du jour", "Encaissements", "À encaisser"];

/** Trésorerie = soldes des comptes de classe 5 (caisse, banques, Mobile Money) de l'exercice en cours. */
function useTresorerie(entrepriseId: string | undefined, actif: boolean) {
  const [montant, setMontant] = useState<number | null>(null);
  useEffect(() => {
    if (!entrepriseId || !actif) return;
    let vivant = true;
    (async () => {
      const jour = aujourdhui();
      const exercice = (await chargerExercices(supabase, entrepriseId)).find(
        (e) => e.date_debut <= jour && jour <= e.date_fin,
      );
      if (!exercice) return;
      const balance = await chargerBalance(supabase, entrepriseId, exercice.id);
      const total = balance
        .filter((l) => l.classe === 5)
        .reduce((s, l) => s + l.solde_debiteur - l.solde_crediteur, 0);
      if (vivant) setMontant(total);
    })().catch(() => {});
    return () => {
      vivant = false;
    };
  }, [entrepriseId, actif]);
  return montant;
}

export default function TableauDeBord() {
  const { session } = useSession();
  const { entreprise, boutique, boutiques, role, admin } = useEspace();
  const prenom = (session?.user.user_metadata?.nom_complet as string | undefined)?.split(" ")[0];
  const compta = peutLireCompta(role);
  const tresorerie = useTresorerie(entreprise?.entreprise_id, compta);

  if (!entreprise) return null;

  return (
    <>
      <EnTetePage
        titre={prenom ? `Bonjour ${prenom}` : "Tableau de bord"}
        description={`${entreprise.raison_sociale} · ${boutique?.nom ?? "aucune boutique"}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {INDICATEURS.map((libelle) => (
          <div key={libelle} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">{libelle}</p>
            <p className="montant mt-2 text-lg font-semibold sm:text-2xl">{formaterXOF(0)}</p>
            <p className="mt-1 text-xs text-muted">Module Ventes à venir</p>
          </div>
        ))}
        <Link
          href={compta ? "/comptabilite/balance" : "#"}
          className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/40"
        >
          <p className="text-sm text-muted">Trésorerie</p>
          <p className="montant mt-2 text-lg font-semibold sm:text-2xl">
            {!compta ? "—" : tresorerie === null ? "…" : formaterXOF(tresorerie)}
          </p>
          <p className="mt-1 text-xs text-muted">Caisse, banques et Mobile Money</p>
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Carte titre="Votre entreprise" action={admin && <Link href="/entreprise" className="text-sm text-primary hover:underline">Modifier</Link>}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Pays</dt>
            <dd>{nomPays(entreprise.pays)}</dd>
            <dt className="text-muted">Devise</dt>
            <dd>Franc CFA (XOF)</dd>
            <dt className="text-muted">Comptabilité</dt>
            <dd>
              SYSCOHADA révisé ·{" "}
              <Badge ton="vert">{entreprise.mode_comptable === "avance" ? "mode avancé" : "mode simplifié"}</Badge>
            </dd>
            <dt className="text-muted">Boutiques</dt>
            <dd>{boutiques.filter((b) => b.active).length}</dd>
            <dt className="text-muted">Votre rôle</dt>
            <dd>{role ? LIBELLES_ROLES[role] : "—"}</dd>
          </dl>
        </Carte>

        <Carte titre="Pour bien démarrer">
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-white">✓</span>
              Entreprise créée
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">2</span>
              <span>
                <Link href="/boutiques" className="font-medium text-primary hover:underline">Ajouter vos boutiques</Link>
                <span className="block text-muted">Un point de vente = une boutique, avec son propre stock.</span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">3</span>
              <span>
                <Link href="/membres" className="font-medium text-primary hover:underline">Inviter votre équipe</Link>
                <span className="block text-muted">Comptable, gestionnaires, vendeurs : chacun avec ses droits.</span>
              </span>
            </li>
            {compta && (
              <li className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">4</span>
                <span>
                  <Link href="/comptabilite/operation" className="font-medium text-primary hover:underline">Enregistrer une recette ou une dépense</Link>
                  <span className="block text-muted">La comptabilité SYSCOHADA se tient automatiquement.</span>
                </span>
              </li>
            )}
            <li className="flex gap-3 text-muted">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-background text-xs font-semibold">5</span>
              Ventes, achats et stock arrivent dans les prochaines étapes.
            </li>
          </ol>
        </Carte>
      </div>
    </>
  );
}
