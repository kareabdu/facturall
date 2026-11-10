import type { SupabaseClient } from "@supabase/supabase-js";

import { traduireErreur } from "./entreprises";
import type { Role } from "./roles";

/**
 * Stock : quantités et valorisation (CMUP) par boutique, mouvements, transferts, inventaires.
 * Les entrées (factures fournisseurs) et sorties (factures clients) sont générées par la base
 * à la validation des documents ; ce module gère le reste et la consultation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TypeMouvementStock =
  | "entree_achat"
  | "retour_fournisseur"
  | "sortie_vente"
  | "retour_client"
  | "transfert_sortie"
  | "transfert_entree"
  | "inventaire"
  | "entree_manuelle"
  | "sortie_manuelle";

export const LIBELLES_MOUVEMENTS: Record<TypeMouvementStock, string> = {
  entree_achat: "Achat",
  retour_fournisseur: "Retour fournisseur",
  sortie_vente: "Vente",
  retour_client: "Retour client",
  transfert_sortie: "Transfert sortant",
  transfert_entree: "Transfert entrant",
  inventaire: "Écart d'inventaire",
  entree_manuelle: "Entrée manuelle",
  sortie_manuelle: "Sortie manuelle",
};

export interface ParametresStock {
  entreprise_id: string;
  autoriser_stock_negatif: boolean;
}

/** Stock d'un article dans une boutique */
export interface LigneStock {
  entreprise_id: string;
  boutique_id: string;
  article_id: string;
  quantite: number;
  valeur: number;
  cmup: number;
  updated_at: string;
  articles?: { designation: string; reference: string | null; unite: string; seuil_alerte: number | null } | null;
}

export interface MouvementStock {
  id: string;
  boutique_id: string;
  article_id: string;
  date_mouvement: string;
  type: TypeMouvementStock;
  quantite: number;
  cout_unitaire: number;
  valeur: number;
  quantite_apres: number;
  valeur_apres: number;
  cmup_apres: number;
  document_vente_id: string | null;
  document_achat_id: string | null;
  transfert_id: string | null;
  inventaire_id: string | null;
  motif: string | null;
  created_at: string;
  articles?: { designation: string; unite: string } | null;
}

export interface LigneTransfert {
  id: string;
  ordre: number;
  article_id: string;
  quantite: number;
  valeur: number;
}

export interface TransfertStock {
  id: string;
  entreprise_id: string;
  numero: string;
  boutique_source_id: string;
  boutique_destination_id: string;
  date_transfert: string;
  notes: string | null;
  valeur_totale: number;
  created_at: string;
  lignes_transferts_stock?: LigneTransfert[];
}

export interface LigneInventaire {
  id: string;
  ordre: number;
  article_id: string;
  quantite_comptee: number;
  quantite_theorique: number | null;
  ecart: number | null;
  valeur_ecart: number | null;
}

export interface Inventaire {
  id: string;
  entreprise_id: string;
  boutique_id: string;
  numero: string | null;
  statut: "brouillon" | "valide";
  date_inventaire: string;
  notes: string | null;
  ecart_valeur: number;
  created_at: string;
  lignes_inventaire?: LigneInventaire[];
}

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

/** Peut ajuster le stock, transférer, inventorier. */
export function peutGererStock(role: Role | null | undefined): boolean {
  return role === "proprietaire" || role === "admin" || role === "comptable" || role === "gestionnaire";
}

/** Peut consulter le stock valorisé (coûts d'achat). Les vendeurs ne voient que les quantités. */
export function peutLireStock(role: Role | null | undefined): boolean {
  return peutGererStock(role) || role === "lecteur";
}

export type NiveauStock = "rupture" | "bas" | "normal";

export function niveauStock(quantite: number, seuil: number | null | undefined): NiveauStock {
  if (quantite <= 0) return "rupture";
  if (seuil != null && quantite <= seuil) return "bas";
  return "normal";
}

export const LIBELLES_NIVEAUX: Record<NiveauStock, string> = {
  rupture: "Rupture",
  bas: "Stock bas",
  normal: "Disponible",
};

/** Lit une quantité saisie (« 2,5 », « 1 200 ») ; null si invalide. 3 décimales au plus. */
export function lireQuantite(saisie: string): number | null {
  const t = saisie.replace(/[\s  ]/g, "").replace(",", ".");
  if (t === "" || !/^-?\d*\.?\d*$/.test(t) || t === "." || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

/** Est-ce une entrée (quantité positive) ? */
export function estEntree(m: Pick<MouvementStock, "quantite">): boolean {
  return m.quantite > 0;
}

// ---------------------------------------------------------------------------
// Accès aux données
// ---------------------------------------------------------------------------

function echec(error: { message: string; code?: string } | null): void {
  if (error) throw new Error(traduireErreur(error));
}
const nombre = (v: unknown) => (typeof v === "string" ? Number(v) : (v as number));

export async function chargerParametresStock(sb: SupabaseClient, entrepriseId: string): Promise<ParametresStock | null> {
  const { data, error } = await sb.from("parametres_stock").select("*").eq("entreprise_id", entrepriseId).maybeSingle();
  echec(error);
  return data as ParametresStock | null;
}

export async function modifierParametresStock(sb: SupabaseClient, entrepriseId: string, autoriserStockNegatif: boolean) {
  const { error } = await sb
    .from("parametres_stock")
    .update({ autoriser_stock_negatif: autoriserStockNegatif })
    .eq("entreprise_id", entrepriseId);
  echec(error);
}

/** Stock valorisé (toutes boutiques accessibles, ou une seule). */
export async function chargerStocks(sb: SupabaseClient, entrepriseId: string, boutiqueId?: string): Promise<LigneStock[]> {
  let q = sb
    .from("stocks")
    .select("*, articles(designation, reference, unite, seuil_alerte)")
    .eq("entreprise_id", entrepriseId);
  if (boutiqueId) q = q.eq("boutique_id", boutiqueId);
  const { data, error } = await q;
  echec(error);
  return ((data ?? []) as LigneStock[])
    .map((s) => ({
      ...s,
      quantite: nombre(s.quantite),
      valeur: nombre(s.valeur),
      cmup: nombre(s.cmup),
      articles: s.articles
        ? { ...s.articles, seuil_alerte: s.articles.seuil_alerte == null ? null : nombre(s.articles.seuil_alerte) }
        : null,
    }))
    .sort((a, b) => (a.articles?.designation ?? "").localeCompare(b.articles?.designation ?? "", "fr"));
}

/** Quantités disponibles d'une boutique, sans les coûts (accessible aux vendeurs). */
export async function chargerDisponibilites(
  sb: SupabaseClient,
  entrepriseId: string,
  boutiqueId: string,
): Promise<Map<string, number>> {
  const { data, error } = await sb.rpc("disponibilites_stock", { p_entreprise_id: entrepriseId, p_boutique_id: boutiqueId });
  echec(error);
  return new Map(((data ?? []) as { article_id: string; quantite: number | string }[]).map((d) => [d.article_id, nombre(d.quantite)]));
}

export async function chargerMouvements(
  sb: SupabaseClient,
  entrepriseId: string,
  filtre: { boutiqueId?: string; articleId?: string; limite?: number } = {},
): Promise<MouvementStock[]> {
  let q = sb
    .from("mouvements_stock")
    .select("*, articles(designation, unite)")
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: false })
    .limit(filtre.limite ?? 200);
  if (filtre.boutiqueId) q = q.eq("boutique_id", filtre.boutiqueId);
  if (filtre.articleId) q = q.eq("article_id", filtre.articleId);
  const { data, error } = await q;
  echec(error);
  return ((data ?? []) as MouvementStock[]).map((m) => ({
    ...m,
    quantite: nombre(m.quantite),
    cout_unitaire: nombre(m.cout_unitaire),
    valeur: nombre(m.valeur),
    quantite_apres: nombre(m.quantite_apres),
    valeur_apres: nombre(m.valeur_apres),
    cmup_apres: nombre(m.cmup_apres),
  }));
}

/**
 * Entrée ou sortie manuelle : stock initial, casse, perte, consommation interne…
 * quantite > 0 : entrée (au coût unitaire indiqué, sinon au CMUP) ; quantite < 0 : sortie au CMUP.
 */
export async function ajusterStock(
  sb: SupabaseClient,
  a: {
    entrepriseId: string;
    boutiqueId: string;
    articleId: string;
    quantite: number;
    motif: string;
    coutUnitaire?: number | null;
    date?: string;
  },
): Promise<string> {
  const { data, error } = await sb.rpc("ajuster_stock", {
    p_entreprise_id: a.entrepriseId,
    p_boutique_id: a.boutiqueId,
    p_article_id: a.articleId,
    p_quantite: a.quantite,
    p_motif: a.motif,
    p_cout_unitaire: a.coutUnitaire ?? null,
    p_date: a.date ?? null,
  });
  echec(error);
  return data as string;
}

// --- Transferts ---------------------------------------------------------------

export async function chargerTransferts(sb: SupabaseClient, entrepriseId: string, limite = 100): Promise<TransfertStock[]> {
  const { data, error } = await sb
    .from("transferts_stock")
    .select("*, lignes_transferts_stock(*)")
    .eq("entreprise_id", entrepriseId)
    .order("date_transfert", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  echec(error);
  return ((data ?? []) as TransfertStock[]).map((t) => ({
    ...t,
    valeur_totale: nombre(t.valeur_totale),
    lignes_transferts_stock: t.lignes_transferts_stock
      ?.map((l) => ({ ...l, quantite: nombre(l.quantite), valeur: nombre(l.valeur) }))
      .sort((a, b) => a.ordre - b.ordre),
  }));
}

export async function transfererStock(
  sb: SupabaseClient,
  t: {
    entrepriseId: string;
    sourceId: string;
    destinationId: string;
    lignes: { article_id: string; quantite: number }[];
    date?: string;
    notes?: string | null;
  },
): Promise<string> {
  const { data, error } = await sb.rpc("transferer_stock", {
    p_entreprise_id: t.entrepriseId,
    p_source_id: t.sourceId,
    p_destination_id: t.destinationId,
    p_lignes: t.lignes,
    p_date: t.date ?? null,
    p_notes: t.notes ?? null,
  });
  echec(error);
  return data as string;
}

// --- Inventaires --------------------------------------------------------------

function normaliserInventaire(i: Inventaire): Inventaire {
  const n = (v: unknown) => (v == null ? null : nombre(v));
  return {
    ...i,
    ecart_valeur: nombre(i.ecart_valeur),
    lignes_inventaire: i.lignes_inventaire
      ?.map((l) => ({
        ...l,
        quantite_comptee: nombre(l.quantite_comptee),
        quantite_theorique: n(l.quantite_theorique),
        ecart: n(l.ecart),
        valeur_ecart: n(l.valeur_ecart),
      }))
      .sort((a, b) => a.ordre - b.ordre),
  };
}

export async function chargerInventaires(sb: SupabaseClient, entrepriseId: string, limite = 100): Promise<Inventaire[]> {
  const { data, error } = await sb
    .from("inventaires")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .order("date_inventaire", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  echec(error);
  return ((data ?? []) as Inventaire[]).map(normaliserInventaire);
}

export async function chargerInventaire(sb: SupabaseClient, id: string): Promise<Inventaire> {
  const { data, error } = await sb.from("inventaires").select("*, lignes_inventaire(*)").eq("id", id).single();
  echec(error);
  return normaliserInventaire(data as Inventaire);
}

export async function enregistrerInventaire(
  sb: SupabaseClient,
  i: {
    entrepriseId: string;
    boutiqueId: string;
    lignes: { article_id: string; quantite_comptee: number }[];
    date?: string;
    notes?: string | null;
    inventaireId?: string | null;
  },
): Promise<string> {
  const { data, error } = await sb.rpc("enregistrer_inventaire", {
    p_entreprise_id: i.entrepriseId,
    p_boutique_id: i.boutiqueId,
    p_lignes: i.lignes,
    p_date: i.date ?? null,
    p_notes: i.notes ?? null,
    p_inventaire_id: i.inventaireId ?? null,
  });
  echec(error);
  return data as string;
}

export async function validerInventaire(sb: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await sb.rpc("valider_inventaire", { p_inventaire_id: id });
  echec(error);
  return data as string;
}

export async function supprimerInventaire(sb: SupabaseClient, id: string) {
  const { error } = await sb.rpc("supprimer_inventaire", { p_inventaire_id: id });
  echec(error);
}
