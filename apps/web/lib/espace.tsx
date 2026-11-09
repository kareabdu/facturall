"use client";

import { EspaceProvider as Fournisseur, useSession } from "@facturall/core/react";
import type { ReactNode } from "react";

import { supabase } from "./supabase";

export { useEspace, memoriserEntreprise, oublierEspace } from "@facturall/core/react";

export function EspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  return (
    <Fournisseur supabase={supabase} userId={session?.user.id ?? null}>
      {children}
    </Fournisseur>
  );
}
