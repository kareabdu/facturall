"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Alerte, Bouton, Chargement, Logo } from "@/components/ui";
import { BarreLaterale } from "@/components/barre-laterale";
import { EspaceProvider, useEspace } from "@/lib/espace";
import { useSession } from "@/lib/session";

/** Toutes les pages qui demandent d'être connecté. */
export default function LayoutEspace({ children }: LayoutProps<"/">) {
  const { session, chargement } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!chargement && !session) router.replace("/connexion");
  }, [chargement, session, router]);

  if (chargement || !session) return <Chargement />;

  return (
    <EspaceProvider>
      <Cadre>{children}</Cadre>
    </EspaceProvider>
  );
}

function Cadre({ children }: { children: ReactNode }) {
  const { chargement, erreur, entreprises, rafraichir } = useEspace();
  const pathname = usePathname();
  const router = useRouter();
  const surCreation = pathname === "/nouvelle-entreprise";
  const aucuneEntreprise = !chargement && !erreur && entreprises.length === 0;

  useEffect(() => {
    if (aucuneEntreprise && !surCreation) router.replace("/nouvelle-entreprise");
  }, [aucuneEntreprise, surCreation, router]);

  if (erreur) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-6">
        <Alerte>{erreur}</Alerte>
        <Bouton variante="secondaire" onClick={() => void rafraichir()}>
          Réessayer
        </Bouton>
      </div>
    );
  }

  if (chargement) return <Chargement />;

  // Première entreprise : écran d'accueil plein écran, sans menu
  if (aucuneEntreprise) {
    if (!surCreation) return <Chargement />;
    return (
      <div className="flex flex-1 flex-col items-center px-4 py-10">
        <Logo className="mb-8" />
        <div className="w-full max-w-2xl">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <BarreLaterale />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8 lg:px-10 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
