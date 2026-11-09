"use client";

import { peutLireCompta } from "@facturall/core";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Alerte, Chargement, Liste } from "@/components/ui";
import { ComptaProvider, useCompta } from "@/lib/compta";
import { useEspace } from "@/lib/espace";

const ONGLETS = [
  { href: "/comptabilite", libelle: "Écritures" },
  { href: "/comptabilite/operation", libelle: "Recette / dépense", saisie: true },
  { href: "/comptabilite/saisie", libelle: "Saisie avancée", saisie: true },
  { href: "/comptabilite/balance", libelle: "Balance et grand livre" },
  { href: "/comptabilite/plan", libelle: "Plan et journaux" },
];

export default function LayoutComptabilite({ children }: LayoutProps<"/comptabilite">) {
  const { role } = useEspace();

  if (!peutLireCompta(role)) {
    return (
      <Alerte>
        La comptabilité est réservée aux propriétaires, administrateurs, comptables et lecteurs.
      </Alerte>
    );
  }

  return (
    <ComptaProvider>
      <Cadre>{children}</Cadre>
    </ComptaProvider>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  const { chargement, erreur, exercices, exercice, choisirExercice, peutSaisir } = useCompta();
  const pathname = usePathname();

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comptabilité</h1>
          <p className="mt-1 text-sm text-muted">SYSCOHADA révisé · montants en FCFA</p>
        </div>
        {exercices.length > 0 && (
          <Liste
            aria-label="Exercice"
            value={exercice?.id ?? ""}
            onChange={(e) => choisirExercice(e.target.value)}
            className="w-auto min-w-40"
          >
            {exercices.map((x) => (
              <option key={x.id} value={x.id}>
                Exercice {x.code}
                {x.statut === "cloture" ? " (clôturé)" : ""}
              </option>
            ))}
          </Liste>
        )}
      </div>

      <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1">
        {ONGLETS.filter((o) => !o.saisie || peutSaisir).map((o) => {
          const actif = o.href === "/comptabilite" ? pathname === o.href : pathname.startsWith(o.href);
          return (
            <Link
              key={o.href}
              href={o.href}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                actif ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {o.libelle}
            </Link>
          );
        })}
      </nav>

      {erreur ? <Alerte>{erreur}</Alerte> : chargement ? <Chargement /> : children}
    </>
  );
}
