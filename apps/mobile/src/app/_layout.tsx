import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ChargementPlein } from '@/components/formulaire';
import { Fournisseurs, useEspace, useSession } from '@/lib/espace';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Fournisseurs>
        <Navigation />
      </Fournisseurs>
      <AnimatedSplashOverlay />
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
