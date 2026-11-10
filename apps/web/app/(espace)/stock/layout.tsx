"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Alerte, Chargement, Onglets } from "@/components/ui";
import { StockProvider, useStock } from "@/lib/stock";

const ONGLETS = [
  { href: "/stock", libelle: "État du stock" },
  { href: "/stock/mouvements", libelle: "Mouvements" },
  { href: "/stock/transferts", libelle: "Transferts" },
  { href: "/stock/inventaires", libelle: "Inventaires" },
];

export default function LayoutStock({ children }: LayoutProps<"/stock">) {
  return (
    <StockProvider>
      <Cadre>{children}</Cadre>
    </StockProvider>
  );
}

function Cadre({ children }: { children: ReactNode }) {
  const { chargement, erreur, peutLire } = useStock();
  const pathname = usePathname();
  const pleinePage = pathname.startsWith("/stock/inventaire/") || pathname === "/stock/inventaire";

  if (!chargement && !peutLire) {
    return (
      <Alerte>
        Le stock valorisé est réservé aux gestionnaires, comptables, administrateurs et lecteurs. Les quantités
        disponibles restent visibles lors de la vente.
      </Alerte>
    );
  }

  return (
    <>
      {!pleinePage && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
            <p className="mt-1 text-sm text-muted">
              Quantités par boutique, valorisation au coût moyen pondéré (CMUP) · montants en FCFA
            </p>
          </div>
          <Onglets
            onglets={ONGLETS}
            actif={(href) => (href === "/stock" ? pathname === href : pathname.startsWith(href))}
          />
        </>
      )}
      {erreur ? <Alerte>{erreur}</Alerte> : chargement ? <Chargement /> : children}
    </>
  );
}
