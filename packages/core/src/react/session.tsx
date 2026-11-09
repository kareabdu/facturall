"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";


interface EtatSession {
  session: Session | null;
  /** true tant que la session stockée n'a pas été relue */
  chargement: boolean;
  /** true juste après un lien « mot de passe oublié » */
  recuperation: boolean;
}

const SessionContext = createContext<EtatSession>({
  session: null,
  chargement: true,
  recuperation: false,
});

export function SessionProvider({ supabase, children }: { supabase: SupabaseClient; children: ReactNode }) {
  const [etat, setEtat] = useState<EtatSession>({ session: null, chargement: true, recuperation: false });

  useEffect(() => {
    let actif = true;

    supabase.auth.getSession().then(({ data }) => {
      if (actif) setEtat((e) => ({ ...e, session: data.session, chargement: false }));
    });

    const { data } = supabase.auth.onAuthStateChange((evenement, session) => {
      setEtat((e) => ({
        session,
        chargement: false,
        recuperation:
          evenement === "PASSWORD_RECOVERY"
            ? true
            : evenement === "USER_UPDATED" || evenement === "SIGNED_OUT"
              ? false
              : e.recuperation,
      }));
    });

    return () => {
      actif = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  return <SessionContext.Provider value={etat}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
