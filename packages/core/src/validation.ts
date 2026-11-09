import { PAYS_UEMOA } from "./pays";
import type { NouvelleEntreprise } from "./types";

export const LONGUEUR_MIN_MOT_DE_PASSE = 8;

export function validerEmail(email: string): string | null {
  const valeur = email.trim();
  if (!valeur) return "Saisissez votre adresse e-mail.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur)) return "Adresse e-mail invalide.";
  return null;
}

export function validerMotDePasse(motDePasse: string): string | null {
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`;
  }
  if (!/[A-Za-z]/.test(motDePasse) || !/\d/.test(motDePasse)) {
    return "Le mot de passe doit contenir des lettres et des chiffres.";
  }
  return null;
}

export function validerNouvelleEntreprise(e: NouvelleEntreprise): string | null {
  const nom = e.raison_sociale.trim();
  if (nom.length < 2) return "La raison sociale doit contenir au moins 2 caractères.";
  if (nom.length > 200) return "La raison sociale est trop longue (200 caractères maximum).";
  if (!PAYS_UEMOA.some((p) => p.code === e.pays)) return "Choisissez un pays de la zone UEMOA.";
  if (e.email && validerEmail(e.email)) return "L'e-mail de l'entreprise est invalide.";
  return null;
}

/** Code boutique : 2 à 10 caractères, lettres majuscules, chiffres ou tiret. */
export function normaliserCodeBoutique(code: string): string {
  return code
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 10);
}

export function validerCodeBoutique(code: string): string | null {
  return /^[A-Z0-9-]{2,10}$/.test(code)
    ? null
    : "Le code doit contenir de 2 à 10 caractères (lettres, chiffres ou tiret).";
}
