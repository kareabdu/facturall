"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Alerte, Chargement, Onglets } from "@/components/ui";
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
          <Onglets
            onglets={ONGLETS}
            actif={(href) => (href === "/ventes" ? pathname === href : pathname.startsWith(href))}
          />
        </>
      )}
      {erreur ? <Alerte>{erreur}</Alerte> : chargement ? <Chargement /> : children}
    </>
  );
}
