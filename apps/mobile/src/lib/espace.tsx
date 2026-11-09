import { EspaceProvider as Fournisseur, SessionProvider as FournisseurSession, useSession } from "@facturall/core/react";
import type { ReactNode } from "react";

import { supabase } from "./supabase";

export { useEspace, useSession, memoriserEntreprise, oublierEspace } from "@facturall/core/react";

/** Session + entreprise/boutique actives, partagés avec le web via @facturall/core. */
export function Fournisseurs({ children }: { children: ReactNode }) {
  return (
    <FournisseurSession supabase={supabase}>
      <Espace>{children}</Espace>
    </FournisseurSession>
  );
}

function Espace({ children }: { children: ReactNode }) {
  const { session } = useSession();
  return (
    <Fournisseur supabase={supabase} userId={session?.user.id ?? null}>
      {children}
    </Fournisseur>
  );
}
