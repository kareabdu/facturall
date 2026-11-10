/**
 * Thème mobile FacturAll : la palette vient de @facturall/core (identique au web).
 */

import '@/global.css';

import { PALETTES, RAYONS, type Palette } from '@facturall/core';
import { Platform } from 'react-native';

function couleurs(p: Palette) {
  return {
    text: p.texte,
    textSecondary: p.texteDiscret,
    background: p.fond,
    /** Cartes, champs */
    backgroundElement: p.surface,
    /** Zones en retrait, éléments sélectionnés discrets */
    backgroundSelected: p.surfaceRetrait,
    border: p.bordure,
    primary: p.primaire,
    onPrimary: p.surPrimaire,
    primarySoft: p.primaireDoux,
    accent: p.accent,
    danger: p.danger,
    dangerSoft: p.dangerDoux,
    warning: p.alerte,
    warningSoft: p.alerteDoux,
    panneau: p.panneau,
    panneauText: p.panneauTexte,
    panneauTextSecondary: p.panneauTexteDiscret,
    panneauBorder: p.panneauBordure,
  };
}

export const Colors = {
  light: couleurs(PALETTES.clair),
  dark: couleurs(PALETTES.sombre),
} as const;

export type Couleurs = ReturnType<typeof couleurs>;
export type ThemeColor = keyof Couleurs;

export const Rayons = RAYONS;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
