/**
 * Nombres entiers en toutes lettres (français, orthographe traditionnelle),
 * pour la mention « Arrêtée la présente facture à la somme de … francs CFA ».
 *   21 → vingt et un · 80 → quatre-vingts · 200 → deux cents · 201 → deux cent un
 *   1 000 → mille · 2 000 000 → deux millions
 */

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0 à 99 */
function deuxChiffres(n: number): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d <= 6) {
    if (u === 0) return DIZAINES[d];
    if (u === 1) return `${DIZAINES[d]} et un`;
    return `${DIZAINES[d]}-${UNITES[u]}`;
  }
  if (d === 7) return u === 1 ? "soixante et onze" : `soixante-${UNITES[10 + u]}`;
  if (d === 8) return u === 0 ? "quatre-vingts" : `quatre-vingt-${UNITES[u]}`;
  return `quatre-vingt-${UNITES[10 + u]}`; // 90 à 99
}

/** 0 à 999 ; `final` : le groupe termine le nombre (accord de « cents », « quatre-vingts ») */
function troisChiffres(n: number, final: boolean): string {
  const c = Math.floor(n / 100);
  const reste = n % 100;
  let texte = "";
  if (c > 0) {
    texte = c === 1 ? "cent" : `${UNITES[c]} cent`;
    if (c > 1 && reste === 0 && final) texte += "s";
  }
  if (reste > 0) {
    let r = deuxChiffres(reste);
    if (!final && reste === 80) r = "quatre-vingt"; // « quatre-vingt mille »
    texte = texte ? `${texte} ${r}` : r;
  }
  return texte;
}

export function nombreEnLettres(valeur: number): string {
  if (!Number.isSafeInteger(valeur)) throw new Error("Entier attendu.");
  if (valeur < 0) return `moins ${nombreEnLettres(-valeur)}`;
  if (valeur === 0) return "zéro";

  const groupes: [number, string, string][] = [
    [1_000_000_000_000, "billion", "billions"],
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
  ];
  const morceaux: string[] = [];
  let n = valeur;

  for (const [taille, singulier, pluriel] of groupes) {
    const q = Math.floor(n / taille);
    if (q > 0) {
      // « millions » est un nom : « quatre-vingts millions », « deux cents millions »
      morceaux.push(`${troisChiffres(q, true)} ${q > 1 ? pluriel : singulier}`);
      n %= taille;
    }
  }
  const milliers = Math.floor(n / 1000);
  if (milliers > 0) {
    // « mille » est invariable, et « cent » / « vingt » ne prennent pas de s devant lui
    morceaux.push(milliers === 1 ? "mille" : `${troisChiffres(milliers, false)} mille`);
    n %= 1000;
  }
  if (n > 0) morceaux.push(troisChiffres(n, true));
  return morceaux.join(" ");
}

/** « cinquante-six mille cinq cent quatre-vingt-huit francs CFA » */
export function montantEnLettres(montant: number): string {
  const lettres = nombreEnLettres(Math.round(montant));
  const texte = `${lettres} franc${Math.abs(montant) > 1 ? "s" : ""} CFA`;
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
