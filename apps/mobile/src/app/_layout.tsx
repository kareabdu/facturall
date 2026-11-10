import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ChargementPlein } from '@/components/formulaire';
import { Fournisseurs, useEspace, useSession } from '@/lib/espace';
import { ThemeApp, useThemeApp } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemeApp>
      <ThemeNavigation>
        <Fournisseurs>
          <Navigation />
        </Fournisseurs>
        <AnimatedSplashOverlay />
      </ThemeNavigation>
    </ThemeApp>
  );
}

/** Thème de navigation (fonds d'écran, en-têtes) aligné sur la palette FacturAll. */
function ThemeNavigation({ children }: { children: ReactNode }) {
  const { schema, couleurs } = useThemeApp();
  const base = schema === 'sombre' ? DarkTheme : DefaultTheme;
  const theme: Theme = {
    ...base,
    dark: schema === 'sombre',
    colors: {
      ...base.colors,
      primary: couleurs.primary,
      background: couleurs.background,
      card: couleurs.backgroundElement,
      text: couleurs.text,
      border: couleurs.border,
      notification: couleurs.danger,
    },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={schema === 'sombre' ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}

/**
 * Trois états :
 *  - non connecté            → connexion / inscription
 *  - connecté sans entreprise → création de la première entreprise
 *  - connecté avec entreprise → onglets de l'application
 */
function Navigation() {
  const { session, chargement: chargementSession } = useSession();
  const espace = useEspace();
  const connecte = !!session;

  if (chargementSession || (connecte && espace.chargement && !espace.erreur)) {
    return <ChargementPlein />;
  }

  const aEntreprise = espace.entreprises.length > 0;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!connecte}>
        <Stack.Screen name="connexion" />
        <Stack.Screen name="inscription" />
      </Stack.Protected>

      <Stack.Protected guard={connecte && !aEntreprise}>
        <Stack.Screen name="nouvelle-entreprise" />
      </Stack.Protected>

      <Stack.Protected guard={connecte && aEntreprise}>
        <Stack.Screen name="(onglets)" />
        <Stack.Screen name="ajouter-entreprise" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}
