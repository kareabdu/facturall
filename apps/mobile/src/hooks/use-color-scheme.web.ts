import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const abonner = () => () => {};

/**
 * Rendu statique (web) : « clair » côté serveur, puis la vraie valeur une fois hydraté.
 */
export function useColorScheme() {
  const hydrate = useSyncExternalStore(abonner, () => true, () => false);
  const colorScheme = useRNColorScheme();
  return hydrate ? colorScheme : 'light';
}
