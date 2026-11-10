"use client";

import {
  chargerArticles,
  chargerComptes,
  chargerFournisseurs,
  chargerJournaux,
  chargerParametresAchat,
  chargerTauxTva,
  peutAcheter,
  peutLireAchats,
  TYPES_TRESORERIE,
  type Article,
  type Compte,
  type Fournisseur,
  type Journal,
  type ParametresAchat,
  type TauxTva,
} from "@facturall/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useEspace } from "./espace";
import { supabase } from "./supabase";

interface EtatAchats {
  chargement: boolean;
  erreur: string | null;
  fournisseurs: Fournisseur[];
  articles: Article[];
  taux: TauxTva[];
  tauxDefaut: TauxTva | undefined;
  parametres: ParametresAchat | null;
  /** Comptes mouvementables actifs de charges (6) et d'immobilisations (2) */
  comptesCharges: Compte[];
  compteParId: Map<string, Compte>;
  tresoreries: Journal[];
  fournisseurParId: Map<string, Fournisseur>;
  tauxParId: Map<string, TauxTva>;
  peutAcheter: boolean;
  peutLire: boolean;
  rafraichir: () => Promise<void>;
}

const AchatsContext = createContext<EtatAchats | null>(null);

export function AchatsProvider({ children }: { children: ReactNode }) {
  const { entreprise, role } = useEspace();
  const entrepriseId = entreprise?.entreprise_id;
  const lecture = peutLireAchats(role);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [taux, setTaux] = useState<TauxTva[]>([]);
  const [parametres, setParametres] = useState<ParametresAchat | null>(null);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);

  const charger = useCallback(async () => {
    if (!entrepriseId) return;
    if (!lecture) {
      setChargement(false);
      return;
    }
    try {
      const [f, a, t, p, c, j] = await Promise.all([
        chargerFournisseurs(supabase, entrepriseId),
        chargerArticles(supabase, entrepriseId),
        chargerTauxTva(supabase, entrepriseId),
        chargerParametresAchat(supabase, entrepriseId),
        chargerComptes(supabase, entrepriseId).catch(() => [] as Compte[]),
        chargerJournaux(supabase, entrepriseId).catch(() => [] as Journal[]),
      ]);
      setFournisseurs(f);
      setArticles(a);
      setTaux(t);
      setParametres(p);
      setComptes(c);
      setJournaux(j);
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

  const valeur = useMemo<EtatAchats>(
    () => ({
      chargement,
      erreur,
      fournisseurs,
      articles,
      taux,
      tauxDefaut: taux.find((t) => t.par_defaut),
      parametres,
      comptesCharges: comptes
        .filter((c) => c.actif && c.mouvementable && (c.classe === 6 || c.classe === 2))
        .sort((a, b) => b.classe - a.classe || a.numero.localeCompare(b.numero)),
      compteParId: new Map(comptes.map((c) => [c.id, c])),
      tresoreries: journaux.filter((j) => j.actif && TYPES_TRESORERIE.includes(j.type)),
      fournisseurParId: new Map(fournisseurs.map((f) => [f.id, f])),
      tauxParId: new Map(taux.map((t) => [t.id, t])),
      peutAcheter: peutAcheter(role),
      peutLire: lecture,
      rafraichir: charger,
    }),
    [chargement, erreur, fournisseurs, articles, taux, parametres, comptes, journaux, role, lecture, charger],
  );

  return <AchatsContext.Provider value={valeur}>{children}</AchatsContext.Provider>;
}

export function useAchats(): EtatAchats {
  const ctx = useContext(AchatsContext);
  if (!ctx) throw new Error("useAchats doit être utilisé dans <AchatsProvider>.");
  return ctx;
}
