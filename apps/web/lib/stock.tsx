"use client";

import {
  chargerArticles,
  chargerParametresStock,
  peutGererStock,
  peutLireStock,
  type Article,
  type Boutique,
  type ParametresStock,
} from "@facturall/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useEspace } from "./espace";
import { supabase } from "./supabase";

interface EtatStock {
  chargement: boolean;
  erreur: string | null;
  /** Articles suivis en stock (actifs et inactifs) */
  articles: Article[];
  articleParId: Map<string, Article>;
  /** Boutiques actives accessibles */
  boutiques: Boutique[];
  boutiqueParId: Map<string, Boutique>;
  parametres: ParametresStock | null;
  peutGerer: boolean;
  peutLire: boolean;
  rafraichir: () => Promise<void>;
}

const StockContext = createContext<EtatStock | null>(null);

export function StockProvider({ children }: { children: ReactNode }) {
  const { entreprise, role, boutiques } = useEspace();
  const entrepriseId = entreprise?.entreprise_id;
  const lecture = peutLireStock(role);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [parametres, setParametres] = useState<ParametresStock | null>(null);

  const charger = useCallback(async () => {
    if (!entrepriseId) return;
    if (!lecture) {
      setChargement(false);
      return;
    }
    try {
      const [a, p] = await Promise.all([chargerArticles(supabase, entrepriseId), chargerParametresStock(supabase, entrepriseId)]);
      setArticles(a.filter((x) => x.suivi_stock));
      setParametres(p);
      setErreur(null);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }, [entrepriseId, lecture]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  const valeur = useMemo<EtatStock>(() => {
    const actives = boutiques.filter((b) => b.active);
    return {
      chargement,
      erreur,
      articles,
      articleParId: new Map(articles.map((a) => [a.id, a])),
      boutiques: actives,
      boutiqueParId: new Map(boutiques.map((b) => [b.id, b])),
      parametres,
      peutGerer: peutGererStock(role),
      peutLire: lecture,
      rafraichir: charger,
    };
  }, [chargement, erreur, articles, boutiques, parametres, role, lecture, charger]);

  return <StockContext.Provider value={valeur}>{children}</StockContext.Provider>;
}

export function useStock(): EtatStock {
  const ctx = useContext(StockContext);
  if (!ctx) throw new Error("useStock doit être utilisé dans <StockProvider>.");
  return ctx;
}
