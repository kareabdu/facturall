import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/hooks/use-theme';

const DURATION = 600;

const sortie = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  30: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 1.06 }], easing: Easing.out(Easing.cubic) },
});

/** Prolonge l'écran de démarrage natif (monogramme FacturAll) puis s'efface en fondu. */
export function AnimatedSplashOverlay() {
  const theme = useTheme();
  const [animer, setAnimer] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const contenu = <Image style={styles.logo} source={require('@/assets/images/splash-icon.png')} />;
  const fond = { backgroundColor: theme.background };

  return animer ? (
    <Animated.View
      entering={sortie.duration(DURATION).withCallback((fini) => {
        'worklet';
        if (fini) scheduleOnRN(setVisible, false);
      })}
      style={[styles.overlay, fond]}>
      {contenu}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => setAnimer(true));
      }}
      style={[styles.overlay, fond]}>
      {contenu}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  logo: { width: 96, height: 96 },
});
