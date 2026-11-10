import type { SupabaseClient } from "@supabase/supabase-js";

import { aujourdhui } from "./comptabilite";
import { traduireErreur } from "./entreprises";

/**
 * Résumé de l'activité pour les tableaux de bord (web et mobile) :
 * ventes nettes (factures − avoirs validés) jour par jour, comparaison avec la période précédente,
 * reste à encaisser et dernières factures.
 */

export interface PointSerie {
  date: string;
  montant: number;
}

export interface FactureRecente {
  id: string;
  numero: string | null;
  date_document: string;
  total_ttc: number;
  reste: number;
  client: string;
}

export interface ResumeVentes {
  /** Ventes nettes TTC par jour, du plus ancien au plus récent */
  serie: PointSerie[];
  totalPeriode: number;
  totalPeriodePrecedente: number;
  /** Variation en % par rapport à la période précédente (null si pas de référence) */
  variation: number | null;
  ventesDuJour: number;
  facturesDuJour: number;
  aEncaisser: number;
  recentes: FactureRecente[];
}

const nombre = (v: unknown) => (typeof v === "string" ? Number(v) : ((v as number) ?? 0));

/** Date locale AAAA-MM-JJ décalée de n jours */
export function decalerDate(iso: string, jours: number): string {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(a, m - 1, j + jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function chargerResumeVentes(
  sb: SupabaseClient,
  entrepriseId: string,
  options: { boutiqueId?: string; jours?: number } = {},
): Promise<ResumeVentes> {
  const jours = options.jours ?? 30;
  const fin = aujourdhui();
  const debut = decalerDate(fin, -(jours - 1));
  const debutPrecedent = decalerDate(debut, -jours);

  let q = sb
    .from("documents_vente")
    .select("id, type, numero, date_document, total_ttc, montant_regle, montant_avoir, clients(nom)")
    .eq("entreprise_id", entrepriseId)
    .in("type", ["facture", "avoir"])
    .eq("statut", "valide")
    .gte("date_document", debutPrecedent)
    .lte("date_document", fin)
    .order("date_document", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5000);
  if (options.boutiqueId) q = q.eq("boutique_id", options.boutiqueId);

  const { data, error } = await q;
  if (error) throw new Error(traduireErreur(error));

  type Ligne = {
    id: string;
    type: "facture" | "avoir";
    numero: string | null;
    date_document: string;
    total_ttc: number | string;
    montant_regle: number | string;
    montant_avoir: number | string;
    clients: { nom: string } | { nom: string }[] | null;
  };
  const lignes = (data ?? []) as Ligne[];

  const parJour = new Map<string, number>();
  let totalPeriode = 0;
  let totalPeriodePrecedente = 0;
  let ventesDuJour = 0;
  let facturesDuJour = 0;
  const recentes: FactureRecente[] = [];

  for (const l of lignes) {
    const signe = l.type === "avoir" ? -1 : 1;
    const ttc = nombre(l.total_ttc) * signe;
    if (l.date_document >= debut) {
      totalPeriode += ttc;
      parJour.set(l.date_document, (parJour.get(l.date_document) ?? 0) + ttc);
      if (l.date_document === fin) {
        ventesDuJour += ttc;
        if (l.type === "facture") facturesDuJour++;
      }
      if (l.type === "facture" && recentes.length < 6) {
        const client = Array.isArray(l.clients) ? l.clients[0]?.nom : l.clients?.nom;
        recentes.push({
          id: l.id,
          numero: l.numero,
          date_document: l.date_document,
          total_ttc: nombre(l.total_ttc),
          reste: nombre(l.total_ttc) - nombre(l.montant_regle) - nombre(l.montant_avoir),
          client: client ?? "",
        });
      }
    } else {
      totalPeriodePrecedente += ttc;
    }
  }

  const serie: PointSerie[] = [];
  for (let i = 0; i < jours; i++) {
    const d = decalerDate(debut, i);
    serie.push({ date: d, montant: parJour.get(d) ?? 0 });
  }

  // Reste à encaisser sur toutes les factures validées (pas seulement la période)
  const { data: situation, error: e2 } = await sb.rpc("situation_clients", { p_entreprise_id: entrepriseId });
  if (e2) throw new Error(traduireErreur(e2));
  const aEncaisser = ((situation ?? []) as { reste_du: number | string }[]).reduce((s, x) => s + nombre(x.reste_du), 0);

  return {
    serie,
    totalPeriode,
    totalPeriodePrecedente,
    variation:
      totalPeriodePrecedente > 0 ? Math.round(((totalPeriode - totalPeriodePrecedente) / totalPeriodePrecedente) * 100) : null,
    ventesDuJour,
    facturesDuJour,
    aEncaisser,
    recentes,
  };
}

/** Montant abrégé pour les grands chiffres : 1,2 M · 340 k · 9 500 */
export function formaterXOFCourt(montant: number): string {
  const abs = Math.abs(montant);
  const signe = montant < 0 ? "−" : "";
  const f = (n: number, d: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(n).replace(/\s/g, " ");
  if (abs >= 1_000_000_000) return `${signe}${f(abs / 1_000_000_000, 1)} Md`;
  if (abs >= 1_000_000) return `${signe}${f(abs / 1_000_000, 1)} M`;
  if (abs >= 100_000) return `${signe}${f(abs / 1_000, 0)} k`;
  return `${signe}${f(abs, 0)}`;
}
