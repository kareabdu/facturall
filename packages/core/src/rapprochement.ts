import type { SupabaseClient } from "@supabase/supabase-js";

import { traduireErreur } from "./entreprises";

/**
 * Rapprochement bancaire : relevés (importés ou saisis), pointage avec les écritures
 * passées sur le compte de trésorerie (521, 571, 552…), état de rapprochement.
 * Montants signés : positif = entrée d'argent, négatif = sortie.
 */

export type SourceReleve = "manuel" | "csv" | "excel" | "pdf";

export interface LigneReleve {
  id: string;
  releve_id: string;
  ordre: number;
  date_operation: string;
  libelle: string;
  reference: string | null;
  montant: number;
  ecriture_ligne_id: string | null;
  pointee_le: string | null;
  /** Opération comptable pointée (chargée avec le relevé) */
  ecriture_lignes?: { ecritures: { numero: string | null; date_ecriture: string; libelle: string } | null } | null;
}

export interface ReleveBancaire {
  id: string;
  entreprise_id: string;
  journal_id: string;
  numero: string | null;
  statut: "brouillon" | "valide";
  date_debut: string;
  date_fin: string;
  solde_initial: number;
  solde_final: number;
  source: SourceReleve;
  fichier: string | null;
  notes: string | null;
  valide_le: string | null;
  created_at: string;
  lignes_releve?: LigneReleve[];
}

export interface OperationAPointer {
  ecriture_ligne_id: string;
  ecriture_id: string;
  date_ecriture: string;
  numero: string | null;
  libelle: string;
  reference: string | null;
  montant: number;
}

export interface EtatRapprochement {
  solde_releve: number;
  solde_calcule: number;
  solde_comptable: number;
  ecritures_non_pointees: number;
  nb_ecritures_non_pointees: number;
  releve_non_pointe: number;
  nb_releve_non_pointe: number;
  ecart: number;
}

/** Ligne prête à être ajoutée à un relevé */
export interface LigneImport {
  date: string;
  libelle: string;
  reference?: string | null;
  montant: number;
}

export const LIBELLES_SOURCES: Record<SourceReleve, string> = {
  manuel: "Saisie manuelle",
  csv: "Import CSV",
  excel: "Import Excel",
  pdf: "Import PDF",
};

// ---------------------------------------------------------------------------
// Accès aux données
// ---------------------------------------------------------------------------

function echec(error: { message: string; code?: string } | null): void {
  if (error) throw new Error(traduireErreur(error));
}
const nombre = (v: unknown) => (typeof v === "string" ? Number(v) : (v as number));

function normaliser(r: ReleveBancaire): ReleveBancaire {
  return {
    ...r,
    solde_initial: nombre(r.solde_initial),
    solde_final: nombre(r.solde_final),
    lignes_releve: r.lignes_releve
      ?.map((l) => ({ ...l, montant: nombre(l.montant) }))
      .sort((a, b) => a.ordre - b.ordre),
  };
}

export async function chargerReleves(sb: SupabaseClient, entrepriseId: string, journalId?: string): Promise<ReleveBancaire[]> {
  let q = sb
    .from("releves_bancaires")
    .select("*, lignes_releve(id, montant, ecriture_ligne_id, ordre)")
    .eq("entreprise_id", entrepriseId)
    .order("date_fin", { ascending: false })
    .limit(200);
  if (journalId) q = q.eq("journal_id", journalId);
  const { data, error } = await q;
  echec(error);
  return ((data ?? []) as ReleveBancaire[]).map(normaliser);
}

export async function chargerReleve(sb: SupabaseClient, id: string): Promise<ReleveBancaire> {
  const { data, error } = await sb
    .from("releves_bancaires")
    .select("*, lignes_releve(*, ecriture_lignes(ecritures(numero, date_ecriture, libelle)))")
    .eq("id", id)
    .single();
  echec(error);
  return normaliser(data as ReleveBancaire);
}

/** Dernier relevé validé du compte : son solde final est le solde initial du suivant. */
export async function dernierReleveValide(sb: SupabaseClient, journalId: string): Promise<ReleveBancaire | null> {
  const { data, error } = await sb
    .from("releves_bancaires")
    .select("*")
    .eq("journal_id", journalId)
    .eq("statut", "valide")
    .order("date_fin", { ascending: false })
    .limit(1);
  echec(error);
  const r = (data ?? [])[0] as ReleveBancaire | undefined;
  return r ? normaliser(r) : null;
}

export interface SaisieReleve {
  entrepriseId: string;
  journalId: string;
  dateDebut: string;
  dateFin: string;
  soldeInitial: number;
  soldeFinal: number;
  /** Lignes ajoutées à la suite des lignes existantes */
  lignes?: LigneImport[];
  source?: SourceReleve;
  fichier?: string | null;
  notes?: string | null;
  releveId?: string | null;
}

export async function enregistrerReleve(sb: SupabaseClient, s: SaisieReleve): Promise<string> {
  const { data, error } = await sb.rpc("enregistrer_releve", {
    p_entreprise_id: s.entrepriseId,
    p_journal_id: s.journalId,
    p_date_debut: s.dateDebut,
    p_date_fin: s.dateFin,
    p_solde_initial: s.soldeInitial,
    p_solde_final: s.soldeFinal,
    p_lignes: s.lignes?.length ? s.lignes : null,
    p_source: s.source ?? "manuel",
    p_fichier: s.fichier ?? null,
    p_notes: s.notes ?? null,
    p_releve_id: s.releveId ?? null,
  });
  echec(error);
  return data as string;
}

export async function supprimerReleve(sb: SupabaseClient, id: string) {
  const { error } = await sb.rpc("supprimer_releve", { p_releve_id: id });
  echec(error);
}

export async function supprimerLigneReleve(sb: SupabaseClient, ligneId: string) {
  const { error } = await sb.rpc("supprimer_ligne_releve", { p_ligne_id: ligneId });
  echec(error);
}

export async function chargerOperationsAPointer(
  sb: SupabaseClient,
  journalId: string,
  dateFin?: string | null,
): Promise<OperationAPointer[]> {
  const { data, error } = await sb.rpc("operations_a_pointer", { p_journal_id: journalId, p_date_fin: dateFin ?? null });
  echec(error);
  return ((data ?? []) as OperationAPointer[]).map((o) => ({ ...o, montant: nombre(o.montant) }));
}

export async function pointerLigneReleve(sb: SupabaseClient, ligneId: string, ecritureLigneId: string) {
  const { error } = await sb.rpc("pointer_ligne_releve", { p_ligne_id: ligneId, p_ecriture_ligne_id: ecritureLigneId });
  echec(error);
}

export async function depointerLigneReleve(sb: SupabaseClient, ligneId: string) {
  const { error } = await sb.rpc("depointer_ligne_releve", { p_ligne_id: ligneId });
  echec(error);
}

/** Pointe tout ce qui correspond (même montant, date proche). Renvoie le nombre de lignes pointées. */
export async function rapprocherAutomatiquement(sb: SupabaseClient, releveId: string, toleranceJours = 7): Promise<number> {
  const { data, error } = await sb.rpc("rapprocher_automatiquement", { p_releve_id: releveId, p_tolerance_jours: toleranceJours });
  echec(error);
  return data as number;
}

/** Crée l'écriture d'une opération connue seulement de la banque (frais, agios…) et la pointe. */
export async function comptabiliserLigneReleve(sb: SupabaseClient, ligneId: string, compteId: string, libelle?: string | null) {
  const { data, error } = await sb.rpc("comptabiliser_ligne_releve", {
    p_ligne_id: ligneId,
    p_compte_id: compteId,
    p_libelle: libelle ?? null,
  });
  echec(error);
  return data as string;
}

export async function validerReleve(sb: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await sb.rpc("valider_releve", { p_releve_id: id });
  echec(error);
  return data as string;
}

export async function chargerEtatRapprochement(sb: SupabaseClient, id: string): Promise<EtatRapprochement> {
  const { data, error } = await sb.rpc("etat_rapprochement", { p_releve_id: id });
  echec(error);
  const e = data as Record<string, number | string>;
  return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, nombre(v)])) as unknown as EtatRapprochement;
}

/** Opérations comptables candidates pour une ligne : même montant, triées par proximité de date. */
export function suggestionsPointage(ligne: Pick<LigneReleve, "montant" | "date_operation">, operations: OperationAPointer[]) {
  const jour = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  return operations
    .filter((o) => o.montant === ligne.montant)
    .sort((a, b) => Math.abs(jour(a.date_ecriture) - jour(ligne.date_operation)) - Math.abs(jour(b.date_ecriture) - jour(ligne.date_operation)));
}

// ---------------------------------------------------------------------------
// Import de relevés (CSV, Excel) : lecture, repérage des colonnes, conversion
// ---------------------------------------------------------------------------

export type Cellule = string | number | Date | boolean | null | undefined;

/** Découpe un CSV (séparateur « ; », « , » ou tabulation détecté, guillemets gérés). */
export function lireCSV(texte: string): string[][] {
  const contenu = texte.replace(/^﻿/, "");
  const premiere = contenu.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const compter = (c: string) => premiere.split(c).length - 1;
  const separateur = ["\t", ";", ","].reduce((m, c) => (compter(c) > compter(m) ? c : m), ";");

  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let guillemets = false;
  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];
    if (guillemets) {
      if (c === '"' && contenu[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === separateur) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && contenu[i + 1] === "\n") i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else champ += c;
  }
  if (champ || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes.map((l) => l.map((x) => x.trim())).filter((l) => l.some((x) => x !== ""));
}

/** Rôle d'une colonne du fichier */
export type RoleColonne = "date" | "libelle" | "reference" | "montant" | "debit" | "credit" | "ignorer";

export const LIBELLES_ROLES_COLONNE: Record<RoleColonne, string> = {
  date: "Date",
  libelle: "Libellé",
  reference: "Référence",
  montant: "Montant (signé)",
  debit: "Débit (sortie)",
  credit: "Crédit (entrée)",
  ignorer: "Ignorer",
};

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Devine le rôle des colonnes d'après les en-têtes (relevés des banques UEMOA, exports Mobile Money). */
export function devinerColonnes(entetes: string[]): RoleColonne[] {
  const roles: RoleColonne[] = entetes.map((brut) => {
    const e = sansAccents(brut);
    if (/date.*valeur|valeur/.test(e)) return "ignorer";
    if (/date|jour/.test(e)) return "date";
    if (/debit|retrait|sortie|decaissement|paiement/.test(e)) return "debit";
    if (/credit|depot|versement|entree|encaissement/.test(e)) return "credit";
    if (/montant|amount|somme/.test(e)) return "montant";
    if (/ref|piece|cheque|transaction|n°|numero/.test(e)) return "reference";
    if (/libelle|description|operation|motif|designation|intitule|detail/.test(e)) return "libelle";
    return "ignorer";
  });
  // Un seul rôle de chaque sorte (sauf « ignorer ») : on garde la première colonne
  const vus = new Set<RoleColonne>();
  return roles.map((r) => {
    if (r === "ignorer") return r;
    if (vus.has(r)) return "ignorer";
    vus.add(r);
    return r;
  });
}

/** Repère la ligne d'en-têtes : la première qui contient une colonne date et une de montant. */
export function trouverEntetes(lignes: Cellule[][]): number {
  const i = lignes.slice(0, 30).findIndex((l) => {
    const r = devinerColonnes(l.map((c) => String(c ?? "")));
    return r.includes("date") && (r.includes("montant") || r.includes("debit") || r.includes("credit"));
  });
  return Math.max(0, i);
}

/** Lit une date : 31/03/2026, 31-03-26, 2026-03-31, 31.03.2026, ou date Excel. Renvoie AAAA-MM-JJ. */
export function lireDate(v: Cellule): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // Numéro de série Excel (jours depuis le 30/12/1899)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return valide(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const annee = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valide(annee, +m[2], +m[1]);
  }
  return null;
}

function valide(a: number, mois: number, j: number): string | null {
  const d = new Date(Date.UTC(a, mois - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== j) return null;
  return d.toISOString().slice(0, 10);
}

/** Lit un montant : « 1 234 500 », « -20.000 », « 1.234,50 », « (2 500) », « 15 000 FCFA ». Arrondi au franc. */
export function lireMontant(v: Cellule): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  let negatif = /^\(.*\)$/.test(s) || /^-|-$/.test(s) || /\bDB?\b$/i.test(s);
  s = s.replace(/[()]/g, "").replace(/f\s?cfa|xof|\bcr\b|\bdb?\b/gi, "").replace(/[\s  ']/g, "");
  if (s.startsWith("-") || s.endsWith("-")) negatif = true;
  s = s.replace(/^-|-$/g, "").replace(/^\+/, "");
  // Séparateur décimal : le dernier « , » ou « . » suivi de 1 ou 2 chiffres ; les autres sont des milliers
  const dec = s.match(/[.,](\d{1,2})$/);
  const entier = dec ? s.slice(0, -dec[0].length) : s;
  const propre = entier.replace(/[.,]/g, "") + (dec ? `.${dec[1]}` : "");
  if (!/^\d+(\.\d+)?$/.test(propre)) return null;
  const n = Math.round(Number(propre));
  return negatif ? -n : n;
}

export interface ResultatConversion {
  lignes: LigneImport[];
  /** Lignes du fichier ignorées (sans date ou sans montant : totaux, soldes, lignes vides) */
  ignorees: number;
}

/** Convertit les lignes du fichier (sans l'en-tête) selon le rôle des colonnes. */
export function convertirLignes(lignes: Cellule[][], roles: RoleColonne[]): ResultatConversion {
  const col = (r: RoleColonne) => roles.indexOf(r);
  const [iDate, iLib, iRef, iMontant, iDebit, iCredit] = (["date", "libelle", "reference", "montant", "debit", "credit"] as const).map(col);
  const resultat: LigneImport[] = [];
  let ignorees = 0;
  for (const l of lignes) {
    const date = iDate >= 0 ? lireDate(l[iDate]) : null;
    let montant: number | null = null;
    if (iMontant >= 0) montant = lireMontant(l[iMontant]);
    else {
      const debit = iDebit >= 0 ? lireMontant(l[iDebit]) : null;
      const credit = iCredit >= 0 ? lireMontant(l[iCredit]) : null;
      if (debit || credit) montant = (credit ? Math.abs(credit) : 0) - (debit ? Math.abs(debit) : 0);
    }
    const libelle = iLib >= 0 ? String(l[iLib] ?? "").trim() : "";
    if (!date || !montant) {
      ignorees++;
      continue;
    }
    const reference = iRef >= 0 ? String(l[iRef] ?? "").trim() || null : null;
    resultat.push({ date, libelle: (libelle || reference || "Opération").slice(0, 300), reference, montant });
  }
  return { lignes: resultat, ignorees };
}

/** Période et total des lignes importées (pour préremplir le relevé). */
export function resumeLignes(lignes: LigneImport[]) {
  const dates = lignes.map((l) => l.date).sort();
  return {
    debut: dates[0] ?? null,
    fin: dates[dates.length - 1] ?? null,
    entrees: lignes.filter((l) => l.montant > 0).reduce((s, l) => s + l.montant, 0),
    sorties: lignes.filter((l) => l.montant < 0).reduce((s, l) => s - l.montant, 0),
    total: lignes.reduce((s, l) => s + l.montant, 0),
  };
}

/** Modèle CSV proposé au téléchargement */
export const MODELE_CSV_RELEVE = "Date;Libellé;Référence;Débit;Crédit\n05/03/2026;PRLV LOYER MARS;;150000;\n10/03/2026;VIR RECU CLIENT;VIR-881;;354000\n";
