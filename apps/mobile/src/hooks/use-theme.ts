import { useThemeApp } from '@/lib/theme';

/** Couleurs du thème affiché (selon la préférence Auto / Clair / Sombre). */
export function useTheme() {
  return useThemeApp().couleurs;
}
