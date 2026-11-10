"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Alerte, Chargement } from "@/components/ui";
import { AchatsProvider, useAchats } from "@/lib/achats";

const ONGLETS = [
  { href: "/achats", libelle: "Factures fournisseurs" },
  { href: "/achats/fournisseurs", libelle: "Fournisseurs" },
];

export default function LayoutAchats({ children }: LayoutProps<"/achats">) {
  return (
    <AchatsProvider>
      <Cadre>{children}</Cadre>
    </AchatsProvider>
  );
}

function Cadre({ children }: { children: ReactNode }) {
  const { chargement, erreur, peutLire } = useAchats();
  const pathname = usePathname();
  const pleinePage = pathname.startsWith("/achats/document");

  if (!chargement && !peutLire) {
    return <Alerte>Les achats sont réservés aux gestionnaires, comptables, administrateurs et lecteurs.</Alerte>;
  }

  return (
    <>
      {!pleinePage && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Achats</h1>
            <p className="mt-1 text-sm text-muted">Factures fournisseurs, avoirs et paiements · montants en FCFA</p>
          </div>
          <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1">
            {ONGLETS.map((o) => {
              const actif = o.href === "/achats" ? pathname === o.href : pathname.startsWith(o.href);
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
        </>
      )}
      {erreur ? <Alerte>{erreur}</Alerte> : chargement ? <Chargement /> : children}
    </>
  );
}
