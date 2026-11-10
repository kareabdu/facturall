import { peutSaisirCompta } from '@facturall/core';
import { NativeTabs } from 'expo-router/native-tabs';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useEspace } from '@/lib/espace';

type SFSymbol = NonNullable<Extract<ComponentProps<typeof NativeTabs.Trigger.Icon>, { sf?: unknown }>['sf']>;

/** Icône : symbole SF sur iOS, image (teintée) ailleurs. */
function icone(sf: SFSymbol, image: number) {
  return Platform.OS === 'ios' ? { sf } : { src: image, renderingMode: 'template' as const };
}

export default function AppTabs() {
  const theme = useTheme();
  const { role } = useEspace();

  return (
    <NativeTabs
      backgroundColor={theme.backgroundElement}
      indicatorColor={theme.primarySoft}
      iconColor={{ default: theme.textSecondary, selected: theme.primary }}
      labelStyle={{ default: { color: theme.textSecondary }, selected: { color: theme.primary, fontWeight: '600' } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Accueil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon {...icone('square.grid.2x2.fill', require('@/assets/images/tabIcons/home.png'))} />
      </NativeTabs.Trigger>

      {/* Recettes et dépenses : réservé à la comptabilité */}
      <NativeTabs.Trigger name="caisse" hidden={!peutSaisirCompta(role)}>
        <NativeTabs.Trigger.Label>Caisse</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon {...icone('banknote.fill', require('@/assets/images/tabIcons/explore.png'))} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="reglages">
        <NativeTabs.Trigger.Label>Réglages</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon {...icone('gearshape.fill', require('@/assets/images/tabIcons/explore.png'))} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
