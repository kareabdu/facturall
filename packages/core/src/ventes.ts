import type { SupabaseClient } from "@supabase/supabase-js";

import { traduireErreur } from "./entreprises";
import type { Role } from "./roles";

/**
 * Ventes : clients, articles, devis, factures, avoirs, règlements.
 * Les montants définitifs sont calculés par la base ; calculerLigne() reproduit
 * le même calcul pour l'aperçu pendant la saisie.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TypeDocument = "devis" | "facture" | "avoir";
export type StatutDocument = "brouillon" | "valide" | "transforme" | "annule";
export type ModeReglement = "especes" | "mobile_money" | "virement" | "cheque" | "carte" | "autre";

export interface TauxTva {
  id: string;
  entreprise_id: string;
  libelle: string;
  taux: number;
  compte_collecte_id: string | null;
  compte_deductible_id: string | null;
  par_defaut: boolean;
  actif: boolean;
}

export interface ParametresVente {
  entreprise_id: string;
  compte_clients_id: string;
  journal_ventes_id: string;
  compte_ventes_biens_id: string;
  compte_ventes_services_id: string;
  delai_paiement_jours: number;
  mentions_facture: string | null;
}

export interface Client {
  id: string;
  entreprise_id: string;
  code: string;
  nom: string;
  type: "particulier" | "entreprise";
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

export interface Article {
  id: string;
  entreprise_id: string;
  reference: string | null;
  designation: string;
  type: "bien" | "service";
  unite: string;
  prix_vente: number;
  taux_tva_id: string | null;
  compte_vente_id: string | null;
  actif: boolean;
}

export interface LigneDocument {
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
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
}

export interface DocumentVente {
  id: string;
  entreprise_id: string;
  boutique_id: string;
  type: TypeDocument;
  numero: string | null;
  statut: StatutDocument;
  client_id: string;
  date_document: string;
  date_echeance: string | null;
  reference_client: string | null;
  notes: string | null;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  montant_regle: number;
  montant_avoir: number;
  document_origine_id: string | null;
  valide_le: string | null;
  created_at: string;
  clients?: { nom: string; code: string } | null;
  lignes_documents_vente?: LigneDocument[];
}

export interface Reglement {
  id: string;
  document_id: string;
  date_reglement: string;
  montant: number;
  mode: ModeReglement;
  journal_id: string;
  reference: string | null;
}

export interface SituationClient {
  client_id: string;
  nb_factures: number;
  total_facture: number;
  total_regle: number;
  total_avoir: number;
  reste_du: number;
  echu: number;
}

/** Ligne en cours de saisie */
export interface LigneSaisieVente {
  article_id: string | null;
  designation: string;
  quantite: number;
  unite?: string | null;
  prix_unitaire: number;
  remise_pct: number;
  taux_tva_id: string | null;
}

// ---------------------------------------------------------------------------
// Libellés et règles
// ---------------------------------------------------------------------------

export const LIBELLES_TYPES_DOCUMENT: Record<TypeDocument, string> = {
  devis: "Devis",
  facture: "Facture",
  avoir: "Avoir",
};

export const LIBELLES_MODES_REGLEMENT: Record<ModeReglement, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  virement: "Virement",
  cheque: "Chèque",
  carte: "Carte bancaire",
  autre: "Autre",
};

/** Peut créer devis, factures, clients et encaisser. */
export function peutVendre(role: Role | null | undefined): boolean {
  return role != null && role !== "lecteur";
}

/** Peut gérer le catalogue (articles, prix). */
export function gereCatalogue(role: Role | null | undefined): boolean {
  return role === "proprietaire" || role === "admin" || role === "comptable" || role === "gestionnaire";
}

/** Peut établir un avoir. */
export function peutFaireAvoir(role: Role | null | undefined): boolean {
  return gereCatalogue(role);
}

/** Reste à payer d'une facture validée. */
export function resteAPayer(d: Pick<DocumentVente, "total_ttc" | "montant_regle" | "montant_avoir">): number {
  return d.total_ttc - d.montant_regle - d.montant_avoir;
}

export type EtatPaiement = "brouillon" | "a_payer" | "partiel" | "paye" | "en_retard" | "annulee";

/** État lisible d'une facture. */
export function etatFacture(d: DocumentVente, aujourdhui: string): EtatPaiement {
  if (d.statut === "brouillon") return "brouillon";
  if (d.montant_avoir > 0 && resteAPayer(d) === 0 && d.montant_regle === 0) return "annulee";
  const reste = resteAPayer(d);
  if (reste === 0) return "paye";
  if (d.date_echeance && d.date_echeance < aujourdhui) return "en_retard";
  return d.montant_regle > 0 ? "partiel" : "a_payer";
}

export const LIBELLES_ETATS: Record<EtatPaiement, string> = {
  brouillon: "Brouillon",
  a_payer: "À payer",
  partiel: "Partiellement payée",
  paye: "Payée",
  en_retard: "En retard",
  annulee: "Annulée par avoir",
};

/** Même calcul que la base : HT = qté × PU × (1 − remise), TVA = HT × taux, arrondis au franc. */
export function calculerLigne(quantite: number, prixUnitaire: number, remisePct: number, taux: number) {
  const ht = Math.round(quantite * prixUnitaire * (1 - remisePct / 100));
  const tva = Math.round((ht * taux) / 100);
  return { ht, tva, ttc: ht + tva };
}

export function totauxDocument(
  lignes: LigneSaisieVente[],
  tauxParId: Map<string, TauxTva>,
  tauxDefaut: TauxTva | undefined,
  articleParId?: Map<string, Article>,
) {
  let ht = 0;
  let tva = 0;
  for (const l of lignes) {
    const tauxId = l.taux_tva_id ?? (l.article_id ? articleParId?.get(l.article_id)?.taux_tva_id : null) ?? tauxDefaut?.id;
    const taux = (tauxId ? tauxParId.get(tauxId)?.taux : undefined) ?? 0;
    const m = calculerLigne(l.quantite || 0, l.prix_unitaire || 0, l.remise_pct || 0, taux);
    ht += m.ht;
    tva += m.tva;
  }
  return { ht, tva, ttc: ht + tva };
}

/** Quantité affichée : « 2 », « 2,5 », « 0,125 » */
export function formaterQuantite(q: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(q);
}

// ---------------------------------------------------------------------------
// Accès aux données
// ---------------------------------------------------------------------------

function echec(error: { message: string; code?: string } | null): void {
  if (error) throw new Error(traduireErreur(error));
}
const nombre = (v: unknown) => (typeof v === "string" ? Number(v) : (v as number));

function normaliserDocument(d: DocumentVente): DocumentVente {
  return {
    ...d,
    total_ht: nombre(d.total_ht),
    total_tva: nombre(d.total_tva),
    total_ttc: nombre(d.total_ttc),
    montant_regle: nombre(d.montant_regle),
    montant_avoir: nombre(d.montant_avoir),
    lignes_documents_vente: d.lignes_documents_vente
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

export async function chargerTauxTva(sb: SupabaseClient, entrepriseId: string): Promise<TauxTva[]> {
  const { data, error } = await sb.from("taux_tva").select("*").eq("entreprise_id", entrepriseId).order("taux", { ascending: false });
  echec(error);
  return ((data ?? []) as TauxTva[]).map((t) => ({ ...t, taux: nombre(t.taux) }));
}

export async function creerTauxTva(
  sb: SupabaseClient,
  entrepriseId: string,
  t: { libelle: string; taux: number; compte_collecte_id: string | null; compte_deductible_id: string | null },
) {
  const { error } = await sb.from("taux_tva").insert({ entreprise_id: entrepriseId, ...t });
  echec(error);
}

export async function modifierTauxTva(sb: SupabaseClient, id: string, champs: { libelle?: string; actif?: boolean }) {
  const { error } = await sb.from("taux_tva").update(champs).eq("id", id);
  echec(error);
}

export async function chargerParametresVente(sb: SupabaseClient, entrepriseId: string): Promise<ParametresVente | null> {
  const { data, error } = await sb.from("parametres_vente").select("*").eq("entreprise_id", entrepriseId).maybeSingle();
  echec(error);
  return data as ParametresVente | null;
}

export async function modifierParametresVente(
  sb: SupabaseClient,
  entrepriseId: string,
  champs: Partial<Omit<ParametresVente, "entreprise_id">>,
) {
  const { error } = await sb.from("parametres_vente").update(champs).eq("entreprise_id", entrepriseId);
  echec(error);
}

export async function chargerClients(sb: SupabaseClient, entrepriseId: string): Promise<Client[]> {
  const { data, error } = await sb.from("clients").select("*").eq("entreprise_id", entrepriseId).order("nom");
  echec(error);
  return (data ?? []) as Client[];
}

export type SaisieClient = Partial<Omit<Client, "id" | "entreprise_id" | "code" | "actif">> & { nom: string };

export async function creerClient(sb: SupabaseClient, entrepriseId: string, c: SaisieClient): Promise<Client> {
  const { data, error } = await sb.from("clients").insert({ entreprise_id: entrepriseId, ...c }).select("*").single();
  echec(error);
  return data as Client;
}

export async function modifierClient(sb: SupabaseClient, id: string, champs: Partial<SaisieClient & { actif: boolean }>) {
  const { error } = await sb.from("clients").update(champs).eq("id", id);
  echec(error);
}

export async function chargerSituationClients(sb: SupabaseClient, entrepriseId: string): Promise<SituationClient[]> {
  const { data, error } = await sb.rpc("situation_clients", { p_entreprise_id: entrepriseId });
  echec(error);
  return ((data ?? []) as SituationClient[]).map((s) => ({
    ...s,
    total_facture: nombre(s.total_facture),
    total_regle: nombre(s.total_regle),
    total_avoir: nombre(s.total_avoir),
    reste_du: nombre(s.reste_du),
    echu: nombre(s.echu),
  }));
}

export async function chargerArticles(sb: SupabaseClient, entrepriseId: string): Promise<Article[]> {
  const { data, error } = await sb.from("articles").select("*").eq("entreprise_id", entrepriseId).order("designation");
  echec(error);
  return ((data ?? []) as Article[]).map((a) => ({ ...a, prix_vente: nombre(a.prix_vente) }));
}

export type SaisieArticle = Omit<Article, "id" | "entreprise_id" | "actif">;

export async function creerArticle(sb: SupabaseClient, entrepriseId: string, a: SaisieArticle): Promise<Article> {
  const { data, error } = await sb.from("articles").insert({ entreprise_id: entrepriseId, ...a }).select("*").single();
  echec(error);
  return data as Article;
}

export async function modifierArticle(sb: SupabaseClient, id: string, champs: Partial<SaisieArticle & { actif: boolean }>) {
  const { error } = await sb.from("articles").update(champs).eq("id", id);
  echec(error);
}

export interface FiltreDocuments {
  type?: TypeDocument;
  boutiqueId?: string;
  clientId?: string;
  limite?: number;
}

export async function chargerDocuments(
  sb: SupabaseClient,
  entrepriseId: string,
  filtre: FiltreDocuments = {},
): Promise<DocumentVente[]> {
  let q = sb
    .from("documents_vente")
    .select("*, clients(nom, code)")
    .eq("entreprise_id", entrepriseId)
    .order("date_document", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filtre.limite ?? 200);
  if (filtre.type) q = q.eq("type", filtre.type);
  if (filtre.boutiqueId) q = q.eq("boutique_id", filtre.boutiqueId);
  if (filtre.clientId) q = q.eq("client_id", filtre.clientId);
  const { data, error } = await q;
  echec(error);
  return ((data ?? []) as DocumentVente[]).map(normaliserDocument);
}

export async function chargerDocument(sb: SupabaseClient, id: string): Promise<DocumentVente> {
  const { data, error } = await sb
    .from("documents_vente")
    .select("*, clients(nom, code), lignes_documents_vente(*)")
    .eq("id", id)
    .single();
  echec(error);
  return normaliserDocument(data as DocumentVente);
}

export async function chargerReglements(sb: SupabaseClient, documentId: string): Promise<Reglement[]> {
  const { data, error } = await sb
    .from("reglements")
    .select("id, document_id, date_reglement, montant, mode, journal_id, reference")
    .eq("document_id", documentId)
    .order("date_reglement");
  echec(error);
  return ((data ?? []) as Reglement[]).map((r) => ({ ...r, montant: nombre(r.montant) }));
}

export interface SaisieDocument {
  entrepriseId: string;
  type: "devis" | "facture";
  boutiqueId: string;
  clientId: string;
  date: string;
  dateEcheance?: string | null;
  lignes: LigneSaisieVente[];
  notes?: string | null;
  referenceClient?: string | null;
  documentId?: string | null;
}

export async function enregistrerDocument(sb: SupabaseClient, s: SaisieDocument): Promise<string> {
  const { data, error } = await sb.rpc("enregistrer_document_vente", {
    p_entreprise_id: s.entrepriseId,
    p_type: s.type,
    p_boutique_id: s.boutiqueId,
    p_client_id: s.clientId,
    p_date: s.date,
    p_lignes: s.lignes.map((l) => ({
      article_id: l.article_id,
      designation: l.designation,
      quantite: l.quantite,
      unite: l.unite ?? null,
      prix_unitaire: l.prix_unitaire,
      remise_pct: l.remise_pct,
      taux_tva_id: l.taux_tva_id,
    })),
    p_date_echeance: s.dateEcheance || null,
    p_notes: s.notes ?? null,
    p_reference_client: s.referenceClient ?? null,
    p_document_id: s.documentId ?? null,
  });
  echec(error);
  return data as string;
}

export interface ReglementImmediat {
  montant: number;
  journal_id: string;
  mode: ModeReglement;
  reference?: string | null;
}

export async function validerDocument(sb: SupabaseClient, id: string, reglement?: ReglementImmediat | null) {
  const { data, error } = await sb.rpc("valider_document_vente", {
    p_document_id: id,
    p_reglement: reglement && reglement.montant > 0 ? reglement : null,
  });
  echec(error);
  return data as string;
}

export async function supprimerDocument(sb: SupabaseClient, id: string) {
  const { error } = await sb.rpc("supprimer_document_vente", { p_document_id: id });
  echec(error);
}

export async function enregistrerReglement(
  sb: SupabaseClient,
  documentId: string,
  r: { montant: number; journalId: string; mode: ModeReglement; date: string; reference?: string | null },
) {
  const { error } = await sb.rpc("enregistrer_reglement", {
    p_document_id: documentId,
    p_montant: r.montant,
    p_journal_id: r.journalId,
    p_mode: r.mode,
    p_date: r.date,
    p_reference: r.reference ?? null,
  });
  echec(error);
}

export async function transformerDevis(sb: SupabaseClient, devisId: string): Promise<string> {
  const { data, error } = await sb.rpc("transformer_devis", { p_devis_id: devisId });
  echec(error);
  return data as string;
}

export async function annulerDevis(sb: SupabaseClient, devisId: string) {
  const { error } = await sb.rpc("annuler_devis", { p_devis_id: devisId });
  echec(error);
}

export async function creerAvoir(sb: SupabaseClient, factureId: string, motif: string, date?: string): Promise<string> {
  const { data, error } = await sb.rpc("creer_avoir", { p_facture_id: factureId, p_motif: motif, p_date: date ?? null });
  echec(error);
  return data as string;
}
