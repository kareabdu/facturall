"use client";

import {
  accepterInvitations,
  chargerBoutiques,
  chargerMesEntreprises,
  estAdmin,
  type Boutique,
  type MonEntreprise,
  type Role,
} from "../index";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * « Espace de travail » : entreprise et boutique actives de l'utilisateur.
 * Le choix est mémorisé via localStorage (navigateur, ou expo-sqlite sur mobile).
 */

const CLE_ENTREPRISE = "facturall.entreprise";
const CLE_BOUTIQUE = "facturall.boutique";

function lire(cle: string): string | null {
  try {
    return globalThis.localStorage?.getItem(cle) ?? null;
  } catch {
    return null;
  }
}
function ecrire(cle: string, valeur: string | null) {
  try {
    if (valeur) globalThis.localStorage?.setItem(cle, valeur);
    else globalThis.localStorage?.removeItem(cle);
  } catch {
    /* stockage indisponible : on ignore */
  }
}

interface EtatEspace {
  chargement: boolean;
  erreur: string | null;
  entreprises: MonEntreprise[];
  entreprise: MonEntreprise | null;
  boutiques: Boutique[];
  boutique: Boutique | null;
  role: Role | null;
  admin: boolean;
  choisirEntreprise: (id: string) => void;
  choisirBoutique: (id: string) => void;
  /** Recharge entreprises et boutiques (après création, invitation…) */
  rafraichir: () => Promise<void>;
}

const EspaceContext = createContext<EtatEspace | null>(null);

export function EspaceProvider({
  supabase,
  userId,
  children,
}: {
  supabase: SupabaseClient;
  userId: string | null;
  children: ReactNode;
}) {
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [entreprises, setEntreprises] = useState<MonEntreprise[]>([]);
  const [entrepriseId, setEntrepriseId] = useState<string | null>(null);
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [boutiqueId, setBoutiqueId] = useState<string | null>(null);
  /** Incrémenté pour forcer le rechargement des boutiques */
  const [version, setVersion] = useState(0);

  const chargerEntreprises = useCallback(async () => {
    if (!userId) {
      // Déconnexion : on oublie tout (le fournisseur peut rester monté sur mobile)
      setEntreprises([]);
      setEntrepriseId(null);
      setBoutiques([]);
      setBoutiqueId(null);
      setChargement(true);
      return;
    }
    setErreur(null);
    try {
      // Rejoint d'abord les entreprises où l'on a été invité
      await accepterInvitations(supabase).catch(() => 0);
      const liste = await chargerMesEntreprises(supabase);
      setEntreprises(liste);
      const memorise = lire(CLE_ENTREPRISE);
      const choisie = liste.find((e) => e.entreprise_id === memorise) ?? liste[0] ?? null;
      setEntrepriseId(choisie?.entreprise_id ?? null);
      if (!choisie) setChargement(false);
    } catch (e) {
      setErreur((e as Error).message);
      setChargement(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    // Chargement initial depuis Supabase : la mise à jour d'état est voulue ici.
    void chargerEntreprises();
  }, [chargerEntreprises]);

  useEffect(() => {
    if (!entrepriseId) return;
    let actif = true;
    ecrire(CLE_ENTREPRISE, entrepriseId);
    chargerBoutiques(supabase, entrepriseId)
      .then((liste) => {
        if (!actif) return;
        const actives = liste.filter((b) => b.active);
        setBoutiques(liste);
        const memorise = lire(CLE_BOUTIQUE);
        const choisie =
          actives.find((b) => b.id === memorise) ?? actives.find((b) => b.est_principale) ?? actives[0] ?? null;
        setBoutiqueId(choisie?.id ?? null);
      })
      .catch((e: Error) => actif && setErreur(e.message))
      .finally(() => actif && setChargement(false));
    return () => {
      actif = false;
    };
  }, [supabase, entrepriseId, version]);

  const valeur = useMemo<EtatEspace>(() => {
    const entreprise = entreprises.find((e) => e.entreprise_id === entrepriseId) ?? null;
    const boutique = boutiques.find((b) => b.id === boutiqueId) ?? null;
    return {
      chargement,
      erreur,
      entreprises,
      entreprise,
      boutiques,
      boutique,
      role: entreprise?.role ?? null,
      admin: estAdmin(entreprise?.role),
      choisirEntreprise: (id) => {
        if (id === entrepriseId) return;
        setChargement(true);
        setBoutiques([]);
        setBoutiqueId(null);
        setEntrepriseId(id);
      },
      choisirBoutique: (id) => {
        ecrire(CLE_BOUTIQUE, id);
        setBoutiqueId(id);
      },
      rafraichir: async () => {
        await chargerEntreprises();
        setVersion((v) => v + 1);
      },
    };
  }, [chargement, erreur, entreprises, entrepriseId, boutiques, boutiqueId, chargerEntreprises]);

  return <EspaceContext.Provider value={valeur}>{children}</EspaceContext.Provider>;
}

export function useEspace(): EtatEspace {
  const ctx = useContext(EspaceContext);
  if (!ctx) throw new Error("useEspace doit être utilisé dans <EspaceProvider>.");
  return ctx;
}

/** Mémorise l'entreprise à ouvrir au prochain chargement (ex. : juste après sa création). */
export function memoriserEntreprise(id: string) {
  ecrire(CLE_ENTREPRISE, id);
  ecrire(CLE_BOUTIQUE, null);
}

/** Oublie l'espace mémorisé (à la déconnexion). */
export function oublierEspace() {
  ecrire(CLE_ENTREPRISE, null);
  ecrire(CLE_BOUTIQUE, null);
}
