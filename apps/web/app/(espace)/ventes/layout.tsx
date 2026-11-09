"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Alerte, Chargement } from "@/components/ui";
import { useVentes, VentesProvider } from "@/lib/ventes";

const ONGLETS = [
  { href: "/ventes", libelle: "Factures et devis" },
  { href: "/ventes/clients", libelle: "Clients" },
  { href: "/ventes/articles", libelle: "Articles et TVA" },
];

export default function LayoutVentes({ children }: LayoutProps<"/ventes">) {
  return (
    <VentesProvider>
      <Cadre>{children}</Cadre>
    </VentesProvider>
  );
}

function Cadre({ children }: { children: ReactNode }) {
  const { chargement, erreur } = useVentes();
  const pathname = usePathname();
  // L'éditeur de document occupe toute la page (et s'imprime seul)
  const pleinePage = pathname.startsWith("/ventes/document");

  return (
    <>
      {!pleinePage && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Ventes</h1>
            <p className="mt-1 text-sm text-muted">Devis, factures, avoirs et encaissements · montants en FCFA</p>
          </div>
          <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1">
            {ONGLETS.map((o) => {
              const actif = o.href === "/ventes" ? pathname === o.href : pathname.startsWith(o.href);
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
