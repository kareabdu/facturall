/**
 * Direction artistique FacturAll (« fintech moderne ») : palette commune au web et au mobile.
 *
 * Le web reprend ces valeurs dans apps/web/app/globals.css (variables CSS) : toute modification
 * ici doit y être reportée. Contrastes vérifiés (WCAG AA) pour le texte sur fond et sur surface.
 */

export interface Palette {
  /** Fond de l'application */
  fond: string;
  /** Cartes, champs, menus */
  surface: string;
  /** Surface en retrait (en-têtes de tableaux, zones secondaires) */
  surfaceRetrait: string;
  texte: string;
  texteDiscret: string;
  bordure: string;
  /** Boutons, liens, éléments actifs */
  primaire: string;
  primaireSurvol: string;
  /** Texte posé sur la couleur primaire */
  surPrimaire: string;
  primaireDoux: string;
  /** Accent décoratif (graphiques, indicateurs) — pas pour du texte sur fond clair */
  accent: string;
  danger: string;
  dangerDoux: string;
  alerte: string;
  alerteDoux: string;
  /** Barre latérale / bandeau sombre (identique en clair et en sombre) */
  panneau: string;
  panneauTexte: string;
  panneauTexteDiscret: string;
  panneauBordure: string;
}

export const PALETTES: Record<"clair" | "sombre", Palette> = {
  clair: {
    fond: "#F3F6F5",
    surface: "#FFFFFF",
    surfaceRetrait: "#F7F9F8",
    texte: "#0E1A16",
    texteDiscret: "#5B6B65",
    bordure: "#E2E8E5",
    primaire: "#087F5B",
    primaireSurvol: "#066A4C",
    surPrimaire: "#FFFFFF",
    primaireDoux: "#E3F6EE",
    accent: "#12B886",
    danger: "#C92A2A",
    dangerDoux: "#FFF0F0",
    alerte: "#A75A00",
    alerteDoux: "#FFF4E5",
    panneau: "#0E1A16",
    panneauTexte: "#E6EEEB",
    panneauTexteDiscret: "#8DA39A",
    panneauBordure: "#1F2E28",
  },
  sombre: {
    fond: "#0A1310",
    surface: "#111D19",
    surfaceRetrait: "#0D1714",
    texte: "#E8F0EC",
    texteDiscret: "#93A69E",
    bordure: "#22332D",
    primaire: "#20C997",
    primaireSurvol: "#38D9A9",
    surPrimaire: "#04130D",
    primaireDoux: "#123A2E",
    accent: "#12B886",
    danger: "#FF8787",
    dangerDoux: "#3A1D1F",
    alerte: "#FFC078",
    alerteDoux: "#3A2A12",
    panneau: "#070E0B",
    panneauTexte: "#E6EEEB",
    panneauTexteDiscret: "#8DA39A",
    panneauBordure: "#1A2823",
  },
};

/** Rayons d'arrondi (px) */
export const RAYONS = { petit: 8, moyen: 12, grand: 16, plein: 999 } as const;

// ---------------------------------------------------------------------------
// Préférence d'apparence : auto (suit l'appareil), clair ou sombre
// ---------------------------------------------------------------------------

export type PreferenceTheme = "auto" | "clair" | "sombre";

export const LIBELLES_THEMES: Record<PreferenceTheme, string> = {
  auto: "Automatique",
  clair: "Clair",
  sombre: "Sombre",
};

const CLE_THEME = "facturall.theme";

/** Lue depuis localStorage (navigateur, ou expo-sqlite sur mobile). */
export function lirePreferenceTheme(): PreferenceTheme {
  try {
    const v = globalThis.localStorage?.getItem(CLE_THEME);
    return v === "clair" || v === "sombre" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function memoriserPreferenceTheme(p: PreferenceTheme): void {
  try {
    if (p === "auto") globalThis.localStorage?.removeItem(CLE_THEME);
    else globalThis.localStorage?.setItem(CLE_THEME, p);
  } catch {
    // stockage indisponible : la préférence ne sera simplement pas retenue
  }
}

/** Thème effectif selon la préférence et le réglage de l'appareil. */
export function themeEffectif(p: PreferenceTheme, appareilSombre: boolean): "clair" | "sombre" {
  return p === "auto" ? (appareilSombre ? "sombre" : "clair") : p;
}
