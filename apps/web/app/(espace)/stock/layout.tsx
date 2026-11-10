"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Alerte, Chargement } from "@/components/ui";
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
          <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1">
            {ONGLETS.map((o) => {
              const actif = o.href === "/stock" ? pathname === o.href : pathname.startsWith(o.href);
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
