"use client";

import { SessionProvider as Fournisseur } from "@facturall/core/react";
import type { ReactNode } from "react";

import { supabase } from "./supabase";

export { useSession } from "@facturall/core/react";

export function SessionProvider({ children }: { children: ReactNode }) {
  return <Fournisseur supabase={supabase}>{children}</Fournisseur>;
}
