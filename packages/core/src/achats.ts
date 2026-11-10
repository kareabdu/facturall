import type { SupabaseClient } from "@supabase/supabase-js";

import { traduireErreur } from "./entreprises";
import type { Role } from "./roles";
import { calculerLigne, type ModeReglement, type TauxTva } from "./ventes";

/**
 * Achats : fournisseurs, factures et avoirs fournisseurs, paiements.
 * Les écritures (journal AC et trésorerie) sont générées par la base.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TypeDocumentAchat = "facture" | "avoir";

export interface ParametresAchat {
  entreprise_id: string;
  compte_fournisseurs_id: string;
  journal_achats_id: string;
  compte_achats_biens_id: string;
  compte_achats_services_id: string;
  delai_paiement_jours: number;
}

export interface Fournisseur {
  id: string;
  entreprise_id: string;
  code: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  ville: string | null;
  identifiant_fiscal: string | null;
  rccm: string | null;
  delai_paiement_jours: number | null;
  notes: string | null;
  actif: boolean;
}

export interface LigneDocumentAchat {
  id: string;
  ordre: number;
  article_id: string | null;
  designation: string;
  quantite: number;
  unite: string | null;
  prix_unitaire: number;
  remise_pct: number;
  taux_tva_id: string | null;
  taux_tva: number;
  compte_charge_id: string;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
}

export interface DocumentAchat {
  id: string;
  entreprise_id: string;
  boutique_id: string;
  type: TypeDocumentAchat;
  numero: string | null;
  numero_fournisseur: string | null;
  statut: "brouillon" | "valide";
  fournisseur_id: string;
  date_document: string;
  date_echeance: string | null;
  notes: string | null;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  montant_paye: number;
  montant_avoir: number;
  document_origine_id: string | null;
  ecriture_id: string | null;
  created_at: string;
  fournisseurs?: { nom: string; code: string } | null;
  lignes_documents_achat?: LigneDocumentAchat[];
}

export interface PaiementFournisseur {
  id: string;
  document_id: string;
  date_paiement: string;
  montant: number;
  mode: ModeReglement;
  journal_id: string;
  reference: string | null;
}

export interface SituationFournisseur {
  fournisseur_id: string;
  nb_factures: number;
  total_facture: number;
  total_paye: number;
  total_avoir: number;
  reste_a_payer: number;
  echu: number;
}

/** Ligne en cours de saisie */
export interface LigneSaisieAchat {
  article_id: string | null;
  designation: string;
  quantite: number;
  unite?: string | null;
  prix_unitaire: number;
  remise_pct: number;
  taux_tva_id: string | null;
  /** Vide = compte par défaut (601 biens / 6057 services) */
  compte_charge_id: string | null;
}

// ---------------------------------------------------------------------------
// Règles
// ---------------------------------------------------------------------------

/** Peut saisir des achats, créer des fournisseurs, payer. */
export function peutAcheter(role: Role | null | undefined): boolean {
  return role === "proprietaire" || role === "admin" || role === "comptable" || role === "gestionnaire";
}

/** Peut consulter les achats (prix d'achat). Les vendeurs n'y ont pas accès. */
export function peutLireAchats(role: Role | null | undefined): boolean {
  return peutAcheter(role) || role === "lecteur";
}

export function resteAPayerAchat(d: Pick<DocumentAchat, "total_ttc" | "montant_paye" | "montant_avoir">): number {
  return d.total_ttc - d.montant_paye - d.montant_avoir;
}

export type EtatAchat = "brouillon" | "a_payer" | "partiel" | "paye" | "en_retard" | "annulee";

export function etatAchat(d: DocumentAchat, aujourdhui: string): EtatAchat {
  if (d.statut === "brouillon") return "brouillon";
  const reste = resteAPayerAchat(d);
  if (d.montant_avoir > 0 && reste === 0 && d.montant_paye === 0) return "annulee";
  if (reste === 0) return "paye";
  if (d.date_echeance && d.date_echeance < aujourdhui) return "en_retard";
  return d.montant_paye > 0 ? "partiel" : "a_payer";
}

export const LIBELLES_ETATS_ACHAT: Record<EtatAchat, string> = {
  brouillon: "Brouillon",
  a_payer: "À payer",
  partiel: "Partiellement payée",
  paye: "Payée",
  en_retard: "Échue",
  annulee: "Annulée par avoir",
};

export function totauxAchat(lignes: LigneSaisieAchat[], tauxParId: Map<string, TauxTva>, tauxDefaut: TauxTva | undefined) {
  let ht = 0;
  let tva = 0;
  for (const l of lignes) {
    const tauxId = l.taux_tva_id ?? tauxDefaut?.id;
    const taux = (tauxId ? tauxParId.get(tauxId)?.taux : undefined) ?? 0;
    const m = calculerLigne(l.quantite || 0, l.prix_unitaire || 0, l.remise_pct || 0, taux);
    ht += m.ht;
    tva += m.tva;
  }
  return { ht, tva, ttc: ht + tva };
}

// ---------------------------------------------------------------------------
// Accès aux données
// ---------------------------------------------------------------------------

function echec(error: { message: string; code?: string } | null): void {
  if (error) throw new Error(traduireErreur(error));
}
const nombre = (v: unknown) => (typeof v === "string" ? Number(v) : (v as number));

function normaliser(d: DocumentAchat): DocumentAchat {
  return {
    ...d,
    total_ht: nombre(d.total_ht),
    total_tva: nombre(d.total_tva),
    total_ttc: nombre(d.total_ttc),
    montant_paye: nombre(d.montant_paye),
    montant_avoir: nombre(d.montant_avoir),
    lignes_documents_achat: d.lignes_documents_achat
      ?.map((l) => ({
        ...l,
        quantite: nombre(l.quantite),
        prix_unitaire: nombre(l.prix_unitaire),
        remise_pct: nombre(l.remise_pct),
        taux_tva: nombre(l.taux_tva),
        montant_ht: nombre(l.montant_ht),
        montant_tva: nombre(l.montant_tva),
        montant_ttc: nombre(l.montant_ttc),
      }))
      .sort((a, b) => a.ordre - b.ordre),
  };
}

export async function chargerParametresAchat(sb: SupabaseClient, entrepriseId: string): Promise<ParametresAchat | null> {
  const { data, error } = await sb.from("parametres_achat").select("*").eq("entreprise_id", entrepriseId).maybeSingle();
  echec(error);
  return data as ParametresAchat | null;
}

export async function modifierParametresAchat(
  sb: SupabaseClient,
  entrepriseId: string,
  champs: Partial<Omit<ParametresAchat, "entreprise_id">>,
) {
  const { error } = await sb.from("parametres_achat").update(champs).eq("entreprise_id", entrepriseId);
  echec(error);
}

export async function chargerFournisseurs(sb: SupabaseClient, entrepriseId: string): Promise<Fournisseur[]> {
  const { data, error } = await sb.from("fournisseurs").select("*").eq("entreprise_id", entrepriseId).order("nom");
  echec(error);
  return (data ?? []) as Fournisseur[];
}

export type SaisieFournisseur = Partial<Omit<Fournisseur, "id" | "entreprise_id" | "code" | "actif">> & { nom: string };

export async function creerFournisseur(sb: SupabaseClient, entrepriseId: string, f: SaisieFournisseur): Promise<Fournisseur> {
  const { data, error } = await sb.from("fournisseurs").insert({ entreprise_id: entrepriseId, ...f }).select("*").single();
  echec(error);
  return data as Fournisseur;
}

export async function modifierFournisseur(sb: SupabaseClient, id: string, champs: Partial<SaisieFournisseur> & { actif?: boolean }) {
  const { error } = await sb.from("fournisseurs").update(champs).eq("id", id);
  echec(error);
}

export async function chargerSituationFournisseurs(sb: SupabaseClient, entrepriseId: string): Promise<SituationFournisseur[]> {
  const { data, error } = await sb.rpc("situation_fournisseurs", { p_entreprise_id: entrepriseId });
  echec(error);
  return ((data ?? []) as SituationFournisseur[]).map((s) => ({
    ...s,
    total_facture: nombre(s.total_facture),
    total_paye: nombre(s.total_paye),
    total_avoir: nombre(s.total_avoir),
    reste_a_payer: nombre(s.reste_a_payer),
    echu: nombre(s.echu),
  }));
}

export async function chargerDocumentsAchat(
  sb: SupabaseClient,
  entrepriseId: string,
  filtre: { type?: TypeDocumentAchat; boutiqueId?: string; fournisseurId?: string; limite?: number } = {},
): Promise<DocumentAchat[]> {
  let q = sb
    .from("documents_achat")
    .select("*, fournisseurs(nom, code)")
    .eq("entreprise_id", entrepriseId)
    .order("date_document", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filtre.limite ?? 200);
  if (filtre.type) q = q.eq("type", filtre.type);
  if (filtre.boutiqueId) q = q.eq("boutique_id", filtre.boutiqueId);
  if (filtre.fournisseurId) q = q.eq("fournisseur_id", filtre.fournisseurId);
  const { data, error } = await q;
  echec(error);
  return ((data ?? []) as DocumentAchat[]).map(normaliser);
}

export async function chargerDocumentAchat(sb: SupabaseClient, id: string): Promise<DocumentAchat> {
  const { data, error } = await sb
    .from("documents_achat")
    .select("*, fournisseurs(nom, code), lignes_documents_achat(*)")
    .eq("id", id)
    .single();
  echec(error);
  return normaliser(data as DocumentAchat);
}

export async function chargerPaiementsFournisseur(sb: SupabaseClient, documentId: string): Promise<PaiementFournisseur[]> {
  const { data, error } = await sb
    .from("paiements_fournisseurs")
    .select("id, document_id, date_paiement, montant, mode, journal_id, reference")
    .eq("document_id", documentId)
    .order("date_paiement");
  echec(error);
  return ((data ?? []) as PaiementFournisseur[]).map((p) => ({ ...p, montant: nombre(p.montant) }));
}

export interface SaisieDocumentAchat {
  entrepriseId: string;
  boutiqueId: string;
  fournisseurId: string;
  numeroFournisseur?: string | null;
  date: string;
  dateEcheance?: string | null;
  lignes: LigneSaisieAchat[];
  notes?: string | null;
  documentId?: string | null;
}

export async function enregistrerDocumentAchat(sb: SupabaseClient, s: SaisieDocumentAchat): Promise<string> {
  const { data, error } = await sb.rpc("enregistrer_document_achat", {
    p_entreprise_id: s.entrepriseId,
    p_boutique_id: s.boutiqueId,
    p_fournisseur_id: s.fournisseurId,
    p_date: s.date,
    p_lignes: s.lignes.map((l) => ({
      article_id: l.article_id,
      designation: l.designation,
      quantite: l.quantite,
      unite: l.unite ?? null,
      prix_unitaire: l.prix_unitaire,
      remise_pct: l.remise_pct,
      taux_tva_id: l.taux_tva_id,
      compte_charge_id: l.compte_charge_id,
    })),
    p_numero_fournisseur: s.numeroFournisseur?.trim() || null,
    p_date_echeance: s.dateEcheance || null,
    p_notes: s.notes ?? null,
    p_document_id: s.documentId ?? null,
  });
  echec(error);
  return data as string;
}

export interface PaiementImmediat {
  montant: number;
  journal_id: string;
  mode: ModeReglement;
  reference?: string | null;
}

export async function validerDocumentAchat(sb: SupabaseClient, id: string, paiement?: PaiementImmediat | null) {
  const { data, error } = await sb.rpc("valider_document_achat", {
    p_document_id: id,
    p_paiement: paiement && paiement.montant > 0 ? paiement : null,
  });
  echec(error);
  return data as string;
}

export async function supprimerDocumentAchat(sb: SupabaseClient, id: string) {
  const { error } = await sb.rpc("supprimer_document_achat", { p_document_id: id });
  echec(error);
}

export async function enregistrerPaiementFournisseur(
  sb: SupabaseClient,
  documentId: string,
  p: { montant: number; journalId: string; mode: ModeReglement; date: string; reference?: string | null },
) {
  const { error } = await sb.rpc("enregistrer_paiement_fournisseur", {
    p_document_id: documentId,
    p_montant: p.montant,
    p_journal_id: p.journalId,
    p_mode: p.mode,
    p_date: p.date,
    p_reference: p.reference ?? null,
  });
  echec(error);
}

export async function creerAvoirAchat(
  sb: SupabaseClient,
  factureId: string,
  motif: string,
  date?: string,
  numeroFournisseur?: string | null,
): Promise<string> {
  const { data, error } = await sb.rpc("creer_avoir_achat", {
    p_facture_id: factureId,
    p_motif: motif,
    p_date: date ?? null,
    p_numero_fournisseur: numeroFournisseur?.trim() || null,
  });
  echec(error);
  return data as string;
}
