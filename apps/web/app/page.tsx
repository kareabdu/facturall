"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Chargement } from "@/components/ui";
import { useSession } from "@/lib/session";

/** Aiguillage : espace de travail si connecté, sinon connexion. */
export default function Accueil() {
  const { session, chargement } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (chargement) return;
    router.replace(session ? "/tableau-de-bord" : "/connexion");
  }, [chargement, session, router]);

  return <Chargement />;
}
