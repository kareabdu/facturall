"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Chargement, Logo } from "@/components/ui";
import { useSession } from "@/lib/session";

/** Pages accessibles sans connexion (connexion, inscription, mot de passe oublié). */
export default function LayoutPublic({ children }: LayoutProps<"/">) {
  const { session, chargement, recuperation } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (chargement) return;
    if (recuperation) router.replace("/nouveau-mot-de-passe");
    else if (session) router.replace("/tableau-de-bord");
  }, [chargement, session, recuperation, router]);

  if (chargement || session) return <Chargement />;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Logo className="mb-8" />
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        {children}
      </div>
      <p className="mt-8 text-center text-xs text-muted">
        Gestion commerciale et comptabilité SYSCOHADA · FCFA
      </p>
    </div>
  );
}
