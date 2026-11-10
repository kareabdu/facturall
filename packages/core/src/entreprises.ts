import type { SupabaseClient } from "@supabase/supabase-js";

import type { Role } from "./roles";
import type {
  Boutique,
  Entreprise,
  Invitation,
  MembreDetail,
  MonEntreprise,
  NouvelleEntreprise,
} from "./types";

/**
 * Accès aux données du socle, partagé entre le web et le mobile.
 * Toutes les fonctions lèvent une erreur (message en français) en cas d'échec.
 */

function echec(error: { message: string; code?: string } | null): never | void {
  if (error) throw new Error(traduireErreur(error));
}

/** Traduit les erreurs Supabase / Postgres les plus courantes. */
export function traduireErreur(error: { message: string; code?: string }): string {
  const m = error.message;
  if (/invalid login credentials/i.test(m)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(m)) return "Confirmez d'abord votre adresse e-mail (lien reçu par e-mail).";
  if (/user already registered/i.test(m)) return "Un compte existe déjà avec cet e-mail.";
  if (/password should be at least/i.test(m)) return "Mot de passe trop court.";
  if (/rate limit|too many requests/i.test(m)) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (/network|fetch failed|failed to fetch/i.test(m)) return "Connexion impossible. Vérifiez votre accès à Internet.";
  if (error.code === "23505" && /boutiques_entreprise_id_code_key/.test(m)) return "Ce code de boutique existe déjà.";
  if (/articles_suivi_stock_biens/.test(m)) return "Seuls les biens (pas les services) peuvent être suivis en stock.";
  if (error.code === "42501" && /row-level security|permission denied/i.test(m)) return "Vous n'avez pas les droits pour cette action.";
  // Les messages levés par nos fonctions SQL sont déjà en français.
  return m;
}

export async function chargerMesEntreprises(sb: SupabaseClient): Promise<MonEntreprise[]> {
  const { data, error } = await sb.rpc("mes_entreprises");
  echec(error);
  return (data ?? []) as MonEntreprise[];
}

export async function chargerEntreprise(sb: SupabaseClient, id: string): Promise<Entreprise> {
  const { data, error } = await sb.from("entreprises").select("*").eq("id", id).single();
  echec(error);
  return data as Entreprise;
}

export async function creerEntreprise(sb: SupabaseClient, e: NouvelleEntreprise): Promise<string> {
  const { data, error } = await sb.rpc("creer_entreprise", {
    p_raison_sociale: e.raison_sociale,
    p_pays: e.pays,
    p_forme_juridique: e.forme_juridique ?? null,
    p_sigle: e.sigle ?? null,
    p_ville: e.ville ?? null,
    p_telephone: e.telephone ?? null,
    p_email: e.email ?? null,
    p_rccm: e.rccm ?? null,
    p_identifiant_fiscal: e.identifiant_fiscal ?? null,
    p_nom_boutique: e.nom_boutique ?? null,
  });
  echec(error);
  return data as string;
}

export type ModificationEntreprise = Partial<
  Pick<
    Entreprise,
    | "raison_sociale"
    | "sigle"
    | "forme_juridique"
    | "ville"
    | "adresse"
    | "telephone"
    | "email"
    | "rccm"
    | "identifiant_fiscal"
    | "systeme_comptable"
    | "mode_comptable"
  >
>;

export async function modifierEntreprise(
  sb: SupabaseClient,
  id: string,
  champs: ModificationEntreprise,
): Promise<void> {
  const { error } = await sb.from("entreprises").update(champs).eq("id", id);
  echec(error);
}

export async function chargerBoutiques(sb: SupabaseClient, entrepriseId: string): Promise<Boutique[]> {
  const { data, error } = await sb
    .from("boutiques")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .order("est_principale", { ascending: false })
    .order("nom");
  echec(error);
  return (data ?? []) as Boutique[];
}

export interface NouvelleBoutique {
  code: string;
  nom: string;
  ville?: string | null;
  adresse?: string | null;
  telephone?: string | null;
}

export async function creerBoutique(
  sb: SupabaseClient,
  entrepriseId: string,
  b: NouvelleBoutique,
): Promise<Boutique> {
  const { data, error } = await sb
    .from("boutiques")
    .insert({ entreprise_id: entrepriseId, ...b })
    .select("*")
    .single();
  echec(error);
  return data as Boutique;
}

export async function modifierBoutique(
  sb: SupabaseClient,
  id: string,
  champs: Partial<NouvelleBoutique & { active: boolean }>,
): Promise<void> {
  const { error } = await sb.from("boutiques").update(champs).eq("id", id);
  echec(error);
}

export async function chargerMembres(sb: SupabaseClient, entrepriseId: string): Promise<MembreDetail[]> {
  const { data, error } = await sb.rpc("membres_entreprise", { p_entreprise_id: entrepriseId });
  echec(error);
  return (data ?? []) as MembreDetail[];
}

export async function modifierMembre(
  sb: SupabaseClient,
  membreId: string,
  role: Role,
  toutesBoutiques: boolean,
  boutiqueIds: string[] = [],
): Promise<void> {
  const { error } = await sb.rpc("modifier_membre", {
    p_membre_id: membreId,
    p_role: role,
    p_toutes_boutiques: toutesBoutiques,
    p_boutique_ids: toutesBoutiques ? [] : boutiqueIds,
  });
  echec(error);
}

export async function activerMembre(sb: SupabaseClient, membreId: string, actif: boolean): Promise<void> {
  const { error } = await sb.from("membres").update({ actif }).eq("id", membreId);
  echec(error);
}

export async function retirerMembre(sb: SupabaseClient, membreId: string): Promise<void> {
  const { error } = await sb.from("membres").delete().eq("id", membreId);
  echec(error);
}

export async function chargerInvitations(sb: SupabaseClient, entrepriseId: string): Promise<Invitation[]> {
  const { data, error } = await sb
    .from("invitations")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .is("acceptee_le", null)
    .order("created_at", { ascending: false });
  echec(error);
  return (data ?? []) as Invitation[];
}

export async function inviterMembre(
  sb: SupabaseClient,
  entrepriseId: string,
  email: string,
  role: Role,
  toutesBoutiques: boolean,
  boutiqueIds: string[] = [],
): Promise<void> {
  const { error } = await sb.rpc("inviter_membre", {
    p_entreprise_id: entrepriseId,
    p_email: email,
    p_role: role,
    p_toutes_boutiques: toutesBoutiques,
    p_boutique_ids: toutesBoutiques ? [] : boutiqueIds,
  });
  echec(error);
}

export async function annulerInvitation(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("invitations").delete().eq("id", id);
  echec(error);
}

/** À appeler après chaque connexion : rejoint les entreprises où l'on a été invité. */
export async function accepterInvitations(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb.rpc("accepter_invitations");
  echec(error);
  return (data as number) ?? 0;
}
