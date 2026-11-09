/**
 * Pays de la zone UEMOA (monnaie XOF), tous membres de l'OHADA.
 * Doit rester synchronisé avec la contrainte `entreprises_pays_check` de la migration.
 */
export const PAYS_UEMOA = [
  { code: "BJ", nom: "Bénin", identifiantFiscal: "IFU" },
  { code: "BF", nom: "Burkina Faso", identifiantFiscal: "IFU" },
  { code: "CI", nom: "Côte d'Ivoire", identifiantFiscal: "NCC" },
  { code: "GW", nom: "Guinée-Bissau", identifiantFiscal: "NIF" },
  { code: "ML", nom: "Mali", identifiantFiscal: "NIF" },
  { code: "NE", nom: "Niger", identifiantFiscal: "NIF" },
  { code: "SN", nom: "Sénégal", identifiantFiscal: "NINEA" },
  { code: "TG", nom: "Togo", identifiantFiscal: "NIF" },
] as const;

export type CodePays = (typeof PAYS_UEMOA)[number]["code"];

export function nomPays(code: string): string {
  return PAYS_UEMOA.find((p) => p.code === code)?.nom ?? code;
}

export function libelleIdentifiantFiscal(code: string): string {
  return PAYS_UEMOA.find((p) => p.code === code)?.identifiantFiscal ?? "Identifiant fiscal";
}

/** Formes juridiques usuelles de l'Acte uniforme OHADA sur les sociétés commerciales. */
export const FORMES_JURIDIQUES = [
  { code: "EI", libelle: "Entreprise individuelle" },
  { code: "SARL", libelle: "SARL" },
  { code: "SARLU", libelle: "SARL unipersonnelle" },
  { code: "SA", libelle: "SA" },
  { code: "SAS", libelle: "SAS" },
  { code: "SASU", libelle: "SAS unipersonnelle" },
  { code: "SNC", libelle: "SNC" },
  { code: "SCS", libelle: "SCS" },
  { code: "GIE", libelle: "GIE" },
  { code: "AUTRE", libelle: "Autre" },
] as const;
