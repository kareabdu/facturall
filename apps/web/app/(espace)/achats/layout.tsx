"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Alerte, Chargement, Onglets } from "@/components/ui";
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
          <Onglets
            onglets={ONGLETS}
            actif={(href) => (href === "/achats" ? pathname === href : pathname.startsWith(href))}
          />
        </>
      )}
      {erreur ? <Alerte>{erreur}</Alerte> : chargement ? <Chargement /> : children}
    </>
  );
}
