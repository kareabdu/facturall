"use client";

import {
  aujourdhui,
  chargerComptes,
  chargerExercices,
  chargerJournaux,
  peutSaisirCompta,
  type Compte,
  type Exercice,
  type Journal,
} from "@facturall/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useEspace } from "./espace";
import { supabase } from "./supabase";

interface EtatCompta {
  chargement: boolean;
  erreur: string | null;
  comptes: Compte[];
  journaux: Journal[];
  exercices: Exercice[];
  /** Exercice consulté (par défaut : celui qui couvre aujourd'hui) */
  exercice: Exercice | null;
  choisirExercice: (id: string) => void;
  compteParId: Map<string, Compte>;
  journalParId: Map<string, Journal>;
  peutSaisir: boolean;
  rafraichir: () => Promise<void>;
}

const ComptaContext = createContext<EtatCompta | null>(null);

export function ComptaProvider({ children }: { children: ReactNode }) {
  const { entreprise, role } = useEspace();
  const entrepriseId = entreprise?.entreprise_id;
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [exerciceId, setExerciceId] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!entrepriseId) return;
    try {
      const [c, j, e] = await Promise.all([
        chargerComptes(supabase, entrepriseId),
        chargerJournaux(supabase, entrepriseId),
        chargerExercices(supabase, entrepriseId),
      ]);
      setComptes(c);
      setJournaux(j);
      setExercices(e);
      const jour = aujourdhui();
      setExerciceId((actuel) =>
        e.some((x) => x.id === actuel)
          ? actuel
          : (e.find((x) => x.date_debut <= jour && jour <= x.date_fin) ?? e[0])?.id ?? null,
      );
      setErreur(null);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setChargement(false);
    }
  }, [entrepriseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  const valeur = useMemo<EtatCompta>(
    () => ({
      chargement,
      erreur,
      comptes,
      journaux,
      exercices,
      exercice: exercices.find((e) => e.id === exerciceId) ?? null,
      choisirExercice: setExerciceId,
      compteParId: new Map(comptes.map((c) => [c.id, c])),
      journalParId: new Map(journaux.map((j) => [j.id, j])),
      peutSaisir: peutSaisirCompta(role),
      rafraichir: charger,
    }),
    [chargement, erreur, comptes, journaux, exercices, exerciceId, role, charger],
  );

  return <ComptaContext.Provider value={valeur}>{children}</ComptaContext.Provider>;
}

export function useCompta(): EtatCompta {
  const ctx = useContext(ComptaContext);
  if (!ctx) throw new Error("useCompta doit être utilisé dans <ComptaProvider>.");
  return ctx;
}
