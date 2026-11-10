import type { SupabaseClient } from "@supabase/supabase-js";

import { aujourdhui, formaterDate, type Journal, type TypeJournal } from "./comptabilite";
import {
  calculerLigne,
  enregistrerDocument,
  formaterQuantite,
  supprimerDocument,
  validerDocument,
  type Article,
  type Client,
  type ModeReglement,
  type TauxTva,
} from "./ventes";
import { formaterXOF } from "./xof";

/**
 * Caisse : vente au comptoir en une étape (facture validée + règlement immédiat).
 * Logique partagée web / mobile ; l'interface ne fait qu'appeler ces fonctions.
 */

export interface LignePanier {
  article: Article;
  quantite: number;
}

/** Modes proposés à la caisse, avec le type de journal de trésorerie correspondant. */
export const MODES_CAISSE: readonly { mode: ModeReglement; libelle: string; journal: TypeJournal }[] = [
  { mode: "especes", libelle: "Espèces", journal: "caisse" },
  { mode: "mobile_money", libelle: "Mobile Money", journal: "monnaie_electronique" },
  { mode: "carte", libelle: "Carte", journal: "banque" },
  { mode: "virement", libelle: "Virement", journal: "banque" },
];

/** Journal de trésorerie à utiliser pour un mode de paiement (le premier actif du bon type). */
export function journalPourMode(journaux: Journal[], mode: ModeReglement): Journal | undefined {
  const type = MODES_CAISSE.find((m) => m.mode === mode)?.journal ?? "caisse";
  return journaux.find((j) => j.actif && j.type === type);
}

/** Client des ventes au comptoir : « Clients divers » (CL0000), créé avec l'entreprise. */
export function clientComptoir(clients: Client[]): Client | undefined {
  return clients.find((c) => c.code === "CL0000" && c.actif) ?? clients.find((c) => c.actif);
}

/** Ajoute (ou retire, si delta < 0) une quantité ; une ligne à zéro disparaît. */
export function modifierPanier(panier: LignePanier[], article: Article, delta: number): LignePanier[] {
  const existe = panier.some((l) => l.article.id === article.id);
  const suivant = existe
    ? panier.map((l) => (l.article.id === article.id ? { ...l, quantite: Math.round((l.quantite + delta) * 1000) / 1000 } : l))
    : delta > 0
      ? [...panier, { article, quantite: delta }]
      : panier;
  return suivant.filter((l) => l.quantite > 0);
}

/** Taux applicable à un article : le sien, sinon celui par défaut de l'entreprise. */
function tauxArticle(article: Article, taux: TauxTva[]): TauxTva | undefined {
  return taux.find((t) => t.id === article.taux_tva_id) ?? taux.find((t) => t.par_defaut && t.actif);
}

/** Montants du panier, calculés comme la base (arrondis par ligne). */
export function totauxPanier(panier: LignePanier[], taux: TauxTva[]) {
  let ht = 0;
  let tva = 0;
  const lignes = panier.map((l) => {
    const m = calculerLigne(l.quantite, l.article.prix_vente, 0, tauxArticle(l.article, taux)?.taux ?? 0);
    ht += m.ht;
    tva += m.tva;
    return { ...l, ttc: m.ttc };
  });
  return { lignes, ht, tva, ttc: ht + tva, articles: panier.reduce((s, l) => s + l.quantite, 0) };
}

export interface SaisieVenteCaisse {
  entrepriseId: string;
  boutiqueId: string;
  clientId: string;
  panier: LignePanier[];
  taux: TauxTva[];
  mode: ModeReglement;
  journalId: string;
  /** Montant encaissé (plafonné au total) ; 0 = vente à crédit. */
  montantEncaisse: number;
  reference?: string | null;
}

/**
 * Crée la facture, la valide et enregistre le règlement en une fois.
 * Si la validation échoue (stock insuffisant…), le brouillon est supprimé pour ne rien laisser traîner.
 */
export async function encaisserVente(sb: SupabaseClient, s: SaisieVenteCaisse): Promise<{ id: string; numero: string }> {
  if (s.panier.length === 0) throw new Error("Le panier est vide.");
  const id = await enregistrerDocument(sb, {
    entrepriseId: s.entrepriseId,
    type: "facture",
    boutiqueId: s.boutiqueId,
    clientId: s.clientId,
    date: aujourdhui(),
    lignes: s.panier.map((l) => ({
      article_id: l.article.id,
      designation: l.article.designation,
      quantite: l.quantite,
      unite: l.article.unite,
      prix_unitaire: l.article.prix_vente,
      remise_pct: 0,
      taux_tva_id: tauxArticle(l.article, s.taux)?.id ?? null,
    })),
  });
  try {
    const numero = await validerDocument(
      sb,
      id,
      s.montantEncaisse > 0
        ? { montant: s.montantEncaisse, journal_id: s.journalId, mode: s.mode, reference: s.reference ?? null }
        : null,
    );
    return { id, numero };
  } catch (e) {
    await supprimerDocument(sb, id).catch(() => undefined);
    throw e;
  }
}

export interface DonneesTicket {
  entreprise: { nom: string; telephone?: string | null; adresse?: string | null };
  boutique?: string | null;
  numero: string;
  date?: string;
  client?: string | null;
  lignes: { designation: string; quantite: number; ttc: number }[];
  ht: number;
  tva: number;
  ttc: number;
  modeLibelle: string;
  recu: number;
  rendu: number;
  reste: number;
}

/** Ticket de caisse en texte brut (partage par WhatsApp, SMS, e-mail, impression thermique). */
export function texteTicket(t: DonneesTicket): string {
  const trait = "--------------------------------";
  const ligne = (g: string, d: string) => `${g}${" ".repeat(Math.max(1, 32 - g.length - d.length))}${d}`;
  const sans = (m: number) => formaterXOF(m, { symbole: false });
  const corps = [
    t.entreprise.nom.toUpperCase(),
    t.boutique ?? null,
    t.entreprise.adresse ?? null,
    t.entreprise.telephone ? `Tél. ${t.entreprise.telephone}` : null,
    trait,
    `Ticket ${t.numero}`,
    `Le ${formaterDate(t.date ?? aujourdhui())}`,
    t.client ? `Client : ${t.client}` : null,
    trait,
    ...t.lignes.flatMap((l) => [l.designation, ligne(`  ${formaterQuantite(l.quantite)} ×`, sans(l.ttc))]),
    trait,
    t.tva > 0 ? ligne("Total HT", sans(t.ht)) : null,
    t.tva > 0 ? ligne("TVA", sans(t.tva)) : null,
    ligne("TOTAL TTC (FCFA)", sans(t.ttc)),
    t.recu > 0 ? ligne(t.modeLibelle, sans(t.recu)) : null,
    t.rendu > 0 ? ligne("Rendu", sans(t.rendu)) : null,
    t.reste > 0 ? ligne("Reste à payer", sans(t.reste)) : null,
    trait,
    "Merci de votre visite !",
  ];
  return corps.filter((x): x is string => x !== null && x !== "").join("\n");
}
