/**
 * Franc CFA BCEAO (XOF).
 * Le XOF n'a pas de subdivision utilisée : tous les montants sont des
 * entiers (francs). On ne manipule jamais de nombres à virgule pour l'argent.
 */

export const DEVISE = "XOF" as const;

/** Vrai si la valeur est un montant XOF valide (entier sûr). */
export function estMontantXOF(valeur: unknown): valeur is number {
  return typeof valeur === "number" && Number.isSafeInteger(valeur);
}

/** Arrondit un résultat de calcul (TVA, remise…) au franc le plus proche. */
export function arrondirXOF(valeur: number): number {
  // Arrondi « au demi supérieur » en valeur absolue, symétrique pour les négatifs.
  return Math.sign(valeur) * Math.round(Math.abs(valeur));
}

const formateur = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/**
 * Formate un montant : 1250000 → « 1 250 000 FCFA ».
 * Les espaces sont insécables pour éviter les retours à la ligne au milieu d'un nombre.
 */
export function formaterXOF(montant: number, options: { symbole?: boolean } = {}): string {
  const { symbole = true } = options;
  const nombre = formateur.format(arrondirXOF(montant)).replace(/[\s ]/g, " ");
  return symbole ? `${nombre} FCFA` : nombre;
}

/**
 * Lit un montant saisi par l'utilisateur : « 1 250 000 », « 1.250.000 », « 1250000 FCFA ».
 * Renvoie null si la saisie n'est pas un entier.
 */
export function lireMontantXOF(saisie: string): number | null {
  const nettoye = saisie
    .replace(/f\s?cfa|xof|f$/gi, "")
    .replace(/[\s  .]/g, "")
    .trim();
  if (!/^-?\d+$/.test(nettoye)) return null;
  const valeur = Number(nettoye);
  return Number.isSafeInteger(valeur) ? valeur : null;
}
