"use client";

import {
  chargerArticles,
  chargerClients,
  chargerJournaux,
  chargerParametresVente,
  chargerTauxTva,
  gereCatalogue,
  peutFaireAvoir,
  peutVendre,
  TYPES_TRESORERIE,
  type Article,
  type Client,
  type Journal,
  type ParametresVente,
  type TauxTva,
} from "@facturall/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useEspace } from "./espace";
import { supabase } from "./supabase";

interface EtatVentes {
  chargement: boolean;
  erreur: string | null;
  clients: Client[];
  articles: Article[];
  taux: TauxTva[];
  tauxDefaut: TauxTva | undefined;
  parametres: ParametresVente | null;
  /** Journaux de trésorerie actifs (caisse, banque, Mobile Money) pour les règlements */
  tresoreries: Journal[];
  clientParId: Map<string, Client>;
  articleParId: Map<string, Article>;
  tauxParId: Map<string, TauxTva>;
  peutVendre: boolean;
  gereCatalogue: boolean;
  peutFaireAvoir: boolean;
  rafraichir: () => Promise<void>;
}

const VentesContext = createContext<EtatVentes | null>(null);

export function VentesProvider({ children }: { children: ReactNode }) {
  const { entreprise, role } = useEspace();
  const entrepriseId = entreprise?.entreprise_id;
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [taux, setTaux] = useState<TauxTva[]>([]);
  const [parametres, setParametres] = useState<ParametresVente | null>(null);
  const [journaux, setJournaux] = useState<Journal[]>([]);

  const charger = useCallback(async () => {
    if (!entrepriseId) return;
    try {
      const [c, a, t, p, j] = await Promise.all([
        chargerClients(supabase, entrepriseId),
        chargerArticles(supabase, entrepriseId),
        chargerTauxTva(supabase, entrepriseId),
        chargerParametresVente(supabase, entrepriseId),
        chargerJournaux(supabase, entrepriseId),
      ]);
      setClients(c);
      setArticles(a);
      setTaux(t);
      setParametres(p);
      setJournaux(j);
      setErreur(null);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargement(false);
    }
  }, [entrepriseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  const valeur = useMemo<EtatVentes>(
    () => ({
      chargement,
      erreur,
      clients,
      articles,
      taux,
      tauxDefaut: taux.find((t) => t.par_defaut),
      parametres,
      tresoreries: journaux.filter((j) => j.actif && TYPES_TRESORERIE.includes(j.type)),
      clientParId: new Map(clients.map((c) => [c.id, c])),
      articleParId: new Map(articles.map((a) => [a.id, a])),
      tauxParId: new Map(taux.map((t) => [t.id, t])),
      peutVendre: peutVendre(role),
      gereCatalogue: gereCatalogue(role),
      peutFaireAvoir: peutFaireAvoir(role),
      rafraichir: charger,
    }),
    [chargement, erreur, clients, articles, taux, parametres, journaux, role, charger],
  );

  return <VentesContext.Provider value={valeur}>{children}</VentesContext.Provider>;
}

export function useVentes(): EtatVentes {
  const ctx = useContext(VentesContext);
  if (!ctx) throw new Error("useVentes doit être utilisé dans <VentesProvider>.");
  return ctx;
}
