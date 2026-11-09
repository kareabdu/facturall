import type { Role } from "./roles";

/**
 * Types des lignes de la base, écrits à la main pour le socle.
 * Une fois la CLI Supabase branchée, `pnpm db:types` générera
 * `database.types.ts`, qui fera foi.
 */

export type ModeComptable = "simplifie" | "avance";
export type SystemeComptable = "normal" | "smt";

export interface Profil {
  id: string;
  email: string | null;
  nom_complet: string | null;
  telephone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entreprise {
  id: string;
  raison_sociale: string;
  sigle: string | null;
  forme_juridique: string | null;
  pays: string;
  ville: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  rccm: string | null;
  identifiant_fiscal: string | null;
  devise: "XOF";
  systeme_comptable: SystemeComptable;
  mode_comptable: ModeComptable;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Boutique {
  id: string;
  entreprise_id: string;
  code: string;
  nom: string;
  ville: string | null;
  adresse: string | null;
  telephone: string | null;
  est_principale: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Membre {
  id: string;
  entreprise_id: string;
  user_id: string;
  role: Role;
  toutes_boutiques: boolean;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: string;
  entreprise_id: string;
  email: string;
  role: Role;
  toutes_boutiques: boolean;
  boutique_ids: string[];
  invite_par: string | null;
  expire_le: string;
  acceptee_le: string | null;
  created_at: string;
}

/** Ligne renvoyée par la fonction `mes_entreprises()`. */
export interface MonEntreprise {
  entreprise_id: string;
  raison_sociale: string;
  sigle: string | null;
  pays: string;
  role: Role;
  toutes_boutiques: boolean;
  mode_comptable: ModeComptable;
}

/** Ligne renvoyée par la fonction `membres_entreprise()`. */
export interface MembreDetail {
  membre_id: string;
  user_id: string;
  email: string | null;
  nom_complet: string | null;
  role: Role;
  toutes_boutiques: boolean;
  boutique_ids: string[];
  actif: boolean;
  created_at: string;
}

/** Paramètres de la fonction `creer_entreprise()`. */
export interface NouvelleEntreprise {
  raison_sociale: string;
  pays: string;
  forme_juridique?: string | null;
  sigle?: string | null;
  ville?: string | null;
  telephone?: string | null;
  email?: string | null;
  rccm?: string | null;
  identifiant_fiscal?: string | null;
  nom_boutique?: string | null;
}
