import type { SupabaseClient } from "@supabase/supabase-js";

import { traduireErreur } from "./entreprises";
import type { Role } from "./roles";

/**
 * Comptabilité générale SYSCOHADA révisé : types, règles et accès aux données.
 * Les règles critiques (équilibre, immuabilité, numérotation) sont garanties par la base ;
 * celles-ci servent à guider l'utilisateur avant l'envoi.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Compte {
  id: string;
  entreprise_id: string;
  numero: string;
  libelle: string;
  classe: number;
  mouvementable: boolean;
  actif: boolean;
  origine: "syscohada" | "entreprise";
}

export type TypeJournal =
  | "achats"
  | "ventes"
  | "banque"
  | "caisse"
  | "monnaie_electronique"
  | "operations_diverses"
  | "a_nouveaux";

export interface Journal {
  id: string;
  entreprise_id: string;
  code: string;
  libelle: string;
  type: TypeJournal;
  compte_tresorerie_id: string | null;
  actif: boolean;
}

export interface Exercice {
  id: string;
  entreprise_id: string;
  code: string;
  date_debut: string;
  date_fin: string;
  statut: "ouvert" | "cloture";
}

export interface LigneEcriture {
  id: string;
  ordre: number;
  compte_id: string;
  libelle: string | null;
  debit: number;
  credit: number;
}

export interface Ecriture {
  id: string;
  entreprise_id: string;
  exercice_id: string;
  journal_id: string;
  numero: string | null;
  date_ecriture: string;
  libelle: string;
  reference: string | null;
  statut: "brouillon" | "validee";
  origine: string;
  boutique_id: string | null;
  contre_passation_de: string | null;
  total: number;
  created_at: string;
  validee_le: string | null;
  ecriture_lignes?: LigneEcriture[];
}

/** Ligne saisie dans un formulaire (montants entiers XOF, 0 si vide). */
export interface LigneSaisie {
  compte_id: string;
  libelle?: string;
  debit: number;
  credit: number;
}

export interface LigneBalance {
  compte_id: string;
  numero: string;
  libelle: string;
  classe: number;
  total_debit: number;
  total_credit: number;
  solde_debiteur: number;
  solde_crediteur: number;
}

export interface LigneGrandLivre {
  ecriture_id: string;
  numero: string;
  date_ecriture: string;
  journal_code: string;
  libelle: string;
  reference: string | null;
  debit: number;
  credit: number;
  solde: number;
}

// ---------------------------------------------------------------------------
// Libellés et règles
// ---------------------------------------------------------------------------

export const CLASSES_SYSCOHADA: Record<number, string> = {
  1: "Ressources durables",
  2: "Actif immobilisé",
  3: "Stocks",
  4: "Tiers",
  5: "Trésorerie",
  6: "Charges des activités ordinaires",
  7: "Produits des activités ordinaires",
  8: "Autres charges et autres produits",
  9: "Comptabilité analytique et engagements",
};

export const LIBELLES_TYPES_JOURNAUX: Record<TypeJournal, string> = {
  achats: "Achats",
  ventes: "Ventes",
  banque: "Banque",
  caisse: "Caisse",
  monnaie_electronique: "Mobile Money",
  operations_diverses: "Opérations diverses",
  a_nouveaux: "À-nouveaux",
};

export const TYPES_TRESORERIE: readonly TypeJournal[] = ["caisse", "banque", "monnaie_electronique"];

/** Peut saisir des écritures. */
export function peutSaisirCompta(role: Role | null | undefined): boolean {
  return role === "proprietaire" || role === "admin" || role === "comptable";
}

/** Peut consulter la comptabilité (écritures, balance). */
export function peutLireCompta(role: Role | null | undefined): boolean {
  return peutSaisirCompta(role) || role === "lecteur";
}

/** Totaux et équilibre d'un ensemble de lignes. */
export function totauxLignes(lignes: { debit: number; credit: number }[]) {
  const debit = lignes.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = lignes.reduce((s, l) => s + (l.credit || 0), 0);
  return { debit, credit, ecart: debit - credit, equilibree: debit === credit && debit > 0 };
}

/** Contrôles avant envoi ; renvoie le premier problème trouvé ou null. */
export function verifierLignes(lignes: LigneSaisie[]): string | null {
  const utiles = lignes.filter((l) => l.compte_id || l.debit || l.credit);
  if (utiles.length < 2) return "Saisissez au moins deux lignes.";
  for (const [i, l] of utiles.entries()) {
    if (!l.compte_id) return `Ligne ${i + 1} : choisissez un compte.`;
    if (!Number.isSafeInteger(l.debit) || !Number.isSafeInteger(l.credit) || l.debit < 0 || l.credit < 0) {
      return `Ligne ${i + 1} : montant invalide.`;
    }
    if ((l.debit > 0) === (l.credit > 0)) return `Ligne ${i + 1} : un montant au débit OU au crédit.`;
  }
  return null;
}

/** Comptes proposés en saisie simplifiée, selon le sens de l'opération. */
export function categoriesOperation(comptes: Compte[], sens: "recette" | "depense"): Compte[] {
  const classes = sens === "depense" ? [6, 8, 2, 4] : [7, 8, 1, 4];
  return comptes
    .filter((c) => c.actif && c.mouvementable && classes.includes(c.classe))
    .sort((a, b) => classes.indexOf(a.classe) - classes.indexOf(b.classe) || a.numero.localeCompare(b.numero));
}

/** Date du jour au format AAAA-MM-JJ (fuseau local). */
export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formaterDate(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

// ---------------------------------------------------------------------------
// Accès aux données
// ---------------------------------------------------------------------------

function echec(error: { message: string; code?: string } | null): void {
  if (error) throw new Error(traduireErreur(error));
}

const nombre = (v: unknown) => (typeof v === "string" ? Number(v) : (v as number));

export async function chargerComptes(sb: SupabaseClient, entrepriseId: string): Promise<Compte[]> {
  const { data, error } = await sb
    .from("comptes")
    .select("id, entreprise_id, numero, libelle, classe, mouvementable, actif, origine")
    .eq("entreprise_id", entrepriseId)
    .order("numero");
  echec(error);
  return (data ?? []) as Compte[];
}

export async function chargerJournaux(sb: SupabaseClient, entrepriseId: string): Promise<Journal[]> {
  const { data, error } = await sb
    .from("journaux")
    .select("id, entreprise_id, code, libelle, type, compte_tresorerie_id, actif")
    .eq("entreprise_id", entrepriseId)
    .order("code");
  echec(error);
  return (data ?? []) as Journal[];
}

export async function chargerExercices(sb: SupabaseClient, entrepriseId: string): Promise<Exercice[]> {
  const { data, error } = await sb
    .from("exercices")
    .select("id, entreprise_id, code, date_debut, date_fin, statut")
    .eq("entreprise_id", entrepriseId)
    .order("date_debut", { ascending: false });
  echec(error);
  return (data ?? []) as Exercice[];
}

export interface FiltreEcritures {
  exerciceId?: string;
  journalId?: string;
  journalIds?: string[];
  statut?: "brouillon" | "validee";
  limite?: number;
}

export async function chargerEcritures(
  sb: SupabaseClient,
  entrepriseId: string,
  filtre: FiltreEcritures = {},
): Promise<Ecriture[]> {
  let q = sb
    .from("ecritures")
    .select("*, ecriture_lignes(id, ordre, compte_id, libelle, debit, credit)")
    .eq("entreprise_id", entrepriseId)
    .order("date_ecriture", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filtre.limite ?? 100);
  if (filtre.exerciceId) q = q.eq("exercice_id", filtre.exerciceId);
  if (filtre.journalId) q = q.eq("journal_id", filtre.journalId);
  if (filtre.journalIds) q = q.in("journal_id", filtre.journalIds);
  if (filtre.statut) q = q.eq("statut", filtre.statut);
  const { data, error } = await q;
  echec(error);
  return ((data ?? []) as Ecriture[]).map((e) => ({
    ...e,
    total: nombre(e.total),
    ecriture_lignes: (e.ecriture_lignes ?? [])
      .map((l) => ({ ...l, debit: nombre(l.debit), credit: nombre(l.credit) }))
      .sort((a, b) => a.ordre - b.ordre),
  }));
}

export interface SaisieEcriture {
  entrepriseId: string;
  journalId: string;
  date: string;
  libelle: string;
  reference?: string | null;
  lignes: LigneSaisie[];
  valider: boolean;
  boutiqueId?: string | null;
  /** Pour modifier un brouillon existant */
  ecritureId?: string | null;
}

export async function enregistrerEcriture(sb: SupabaseClient, s: SaisieEcriture): Promise<string> {
  const { data, error } = await sb.rpc("enregistrer_ecriture", {
    p_entreprise_id: s.entrepriseId,
    p_journal_id: s.journalId,
    p_date: s.date,
    p_libelle: s.libelle,
    p_lignes: s.lignes
      .filter((l) => l.compte_id || l.debit || l.credit)
      .map((l) => ({ compte_id: l.compte_id, libelle: l.libelle ?? null, debit: l.debit || 0, credit: l.credit || 0 })),
    p_reference: s.reference ?? null,
    p_valider: s.valider,
    p_boutique_id: s.boutiqueId ?? null,
    p_ecriture_id: s.ecritureId ?? null,
  });
  echec(error);
  return data as string;
}

export async function validerEcriture(sb: SupabaseClient, ecritureId: string): Promise<string> {
  const { data, error } = await sb.rpc("valider_ecriture", { p_ecriture_id: ecritureId });
  echec(error);
  return data as string;
}

export async function supprimerBrouillon(sb: SupabaseClient, ecritureId: string): Promise<void> {
  const { error } = await sb.rpc("supprimer_brouillon", { p_ecriture_id: ecritureId });
  echec(error);
}

export async function contrePasserEcriture(sb: SupabaseClient, ecritureId: string, date?: string): Promise<string> {
  const { data, error } = await sb.rpc("contre_passer_ecriture", {
    p_ecriture_id: ecritureId,
    p_date: date ?? aujourdhui(),
  });
  echec(error);
  return data as string;
}

export interface OperationSimple {
  entrepriseId: string;
  sens: "recette" | "depense";
  date: string;
  montant: number;
  journalId: string;
  compteId: string;
  libelle: string;
  reference?: string | null;
  boutiqueId?: string | null;
}

export async function enregistrerOperationSimple(sb: SupabaseClient, o: OperationSimple): Promise<string> {
  const { data, error } = await sb.rpc("enregistrer_operation_simple", {
    p_entreprise_id: o.entrepriseId,
    p_sens: o.sens,
    p_date: o.date,
    p_montant: o.montant,
    p_journal_id: o.journalId,
    p_compte_id: o.compteId,
    p_libelle: o.libelle,
    p_reference: o.reference ?? null,
    p_boutique_id: o.boutiqueId ?? null,
  });
  echec(error);
  return data as string;
}

export async function creerCompte(sb: SupabaseClient, entrepriseId: string, numero: string, libelle: string) {
  const { data, error } = await sb.rpc("creer_compte", {
    p_entreprise_id: entrepriseId,
    p_numero: numero,
    p_libelle: libelle,
  });
  echec(error);
  return data as string;
}

export async function modifierCompte(sb: SupabaseClient, id: string, champs: { libelle?: string; actif?: boolean }) {
  const { error } = await sb.from("comptes").update(champs).eq("id", id);
  echec(error);
}

export async function creerJournal(
  sb: SupabaseClient,
  entrepriseId: string,
  j: { code: string; libelle: string; type: TypeJournal; compteTresorerieId?: string | null },
) {
  const { data, error } = await sb.rpc("creer_journal", {
    p_entreprise_id: entrepriseId,
    p_code: j.code,
    p_libelle: j.libelle,
    p_type: j.type,
    p_compte_tresorerie_id: j.compteTresorerieId ?? null,
  });
  echec(error);
  return data as string;
}

export async function modifierJournal(sb: SupabaseClient, id: string, champs: { libelle?: string; actif?: boolean }) {
  const { error } = await sb.from("journaux").update(champs).eq("id", id);
  echec(error);
}

export async function creerExercice(sb: SupabaseClient, entrepriseId: string, code: string, debut: string, fin: string) {
  const { data, error } = await sb.rpc("creer_exercice", {
    p_entreprise_id: entrepriseId,
    p_code: code,
    p_date_debut: debut,
    p_date_fin: fin,
  });
  echec(error);
  return data as string;
}

export async function chargerBalance(
  sb: SupabaseClient,
  entrepriseId: string,
  exerciceId: string,
  dateFin?: string | null,
): Promise<LigneBalance[]> {
  const { data, error } = await sb.rpc("balance_generale", {
    p_entreprise_id: entrepriseId,
    p_exercice_id: exerciceId,
    p_date_fin: dateFin || null,
  });
  echec(error);
  return ((data ?? []) as LigneBalance[]).map((l) => ({
    ...l,
    total_debit: nombre(l.total_debit),
    total_credit: nombre(l.total_credit),
    solde_debiteur: nombre(l.solde_debiteur),
    solde_crediteur: nombre(l.solde_crediteur),
  }));
}

export async function chargerGrandLivre(
  sb: SupabaseClient,
  entrepriseId: string,
  compteId: string,
  exerciceId: string,
  dateFin?: string | null,
): Promise<LigneGrandLivre[]> {
  const { data, error } = await sb.rpc("grand_livre", {
    p_entreprise_id: entrepriseId,
    p_compte_id: compteId,
    p_exercice_id: exerciceId,
    p_date_fin: dateFin || null,
  });
  echec(error);
  return ((data ?? []) as LigneGrandLivre[]).map((l) => ({
    ...l,
    debit: nombre(l.debit),
    credit: nombre(l.credit),
    solde: nombre(l.solde),
  }));
}

/** Balance au format CSV (séparateur « ; » pour Excel en français). */
export function balanceEnCSV(lignes: LigneBalance[]): string {
  const entete = ["Compte", "Intitulé", "Total débit", "Total crédit", "Solde débiteur", "Solde créditeur"];
  const echapper = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const corps = lignes.map((l) =>
    [l.numero, echapper(l.libelle), l.total_debit, l.total_credit, l.solde_debiteur, l.solde_crediteur].join(";"),
  );
  return [entete.join(";"), ...corps].join("\r\n");
}

// ---------------------------------------------------------------------------
// Trésorerie : soldes et mouvements des journaux caisse / banque / Mobile Money
// ---------------------------------------------------------------------------

export interface SoldeTresorerie {
  journal: Journal;
  /** Solde du compte de trésorerie (débit − crédit), à-nouveaux compris. */
  solde: number;
}

export interface MouvementTresorerie {
  ecriture: Ecriture;
  journal: Journal;
  /** Positif = entrée d'argent, négatif = sortie. */
  montant: number;
}

/** Exercice ouvert contenant la date, sinon le plus récent. */
export function exerciceCourant(exercices: Exercice[], date = aujourdhui()): Exercice | undefined {
  return (
    exercices.find((e) => e.statut === "ouvert" && e.date_debut <= date && date <= e.date_fin) ??
    [...exercices].sort((a, b) => b.date_debut.localeCompare(a.date_debut))[0]
  );
}

/**
 * Soldes des comptes de trésorerie sur l'exercice courant et derniers mouvements,
 * toutes origines confondues (saisie simple, règlements clients, paiements fournisseurs…).
 */
export async function chargerTresorerie(
  sb: SupabaseClient,
  entrepriseId: string,
  options: { limite?: number } = {},
): Promise<{ soldes: SoldeTresorerie[]; mouvements: MouvementTresorerie[]; journaux: Journal[] }> {
  const [journaux, exercices] = await Promise.all([chargerJournaux(sb, entrepriseId), chargerExercices(sb, entrepriseId)]);
  const tresoreries = journaux.filter((j) => j.actif && TYPES_TRESORERIE.includes(j.type) && j.compte_tresorerie_id);
  if (tresoreries.length === 0) return { soldes: [], mouvements: [], journaux };
  const exercice = exerciceCourant(exercices);
  const [balance, ecritures] = await Promise.all([
    exercice ? chargerBalance(sb, entrepriseId, exercice.id) : Promise.resolve([] as LigneBalance[]),
    chargerEcritures(sb, entrepriseId, {
      journalIds: tresoreries.map((j) => j.id),
      statut: "validee",
      limite: options.limite ?? 15,
    }),
  ]);
  const soldes = tresoreries.map((journal) => {
    const l = balance.find((b) => b.compte_id === journal.compte_tresorerie_id);
    return { journal, solde: l ? l.total_debit - l.total_credit : 0 };
  });
  const mouvements = ecritures.flatMap((ecriture) => {
    const journal = tresoreries.find((j) => j.id === ecriture.journal_id);
    if (!journal) return [];
    const montant = (ecriture.ecriture_lignes ?? [])
      .filter((l) => l.compte_id === journal.compte_tresorerie_id)
      .reduce((s, l) => s + l.debit - l.credit, 0);
    return [{ ecriture, journal, montant }];
  });
  return { soldes, mouvements, journaux };
}
