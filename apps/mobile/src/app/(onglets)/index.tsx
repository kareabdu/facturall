import { formaterXOF, LIBELLES_ROLES } from '@facturall/core';
import { StyleSheet, View } from 'react-native';

import { Carte, Ecran } from '@/components/formulaire';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Couleurs, Spacing } from '@/constants/theme';
import { useEspace, useSession } from '@/lib/espace';

const INDICATEURS = ['Ventes du jour', 'Encaissements', 'À encaisser', 'Trésorerie'];

export default function Accueil() {
  const { session } = useSession();
  const { entreprise, boutique, role } = useEspace();
  const prenom = (session?.user.user_metadata?.nom_complet as string | undefined)?.split(' ')[0];

  return (
    <Ecran onglets>
      <View style={styles.entete}>
        <ThemedText type="subtitle">{prenom ? `Bonjour ${prenom}` : 'Accueil'}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {entreprise?.sigle || entreprise?.raison_sociale} · {boutique?.nom ?? 'aucune boutique'}
        </ThemedText>
        {role && (
          <ThemedText type="small" style={{ color: Couleurs.primaire }}>
            {LIBELLES_ROLES[role]}
          </ThemedText>
        )}
      </View>

      <View style={styles.grille}>
        {INDICATEURS.map((libelle) => (
          <ThemedView key={libelle} type="backgroundElement" style={styles.tuile}>
            <ThemedText type="small" themeColor="textSecondary">
              {libelle}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.montant}>
              {formaterXOF(0)}
            </ThemedText>
          </ThemedView>
        ))}
      </View>

      <Carte titre="Prochaines étapes">
        <ThemedText type="small" themeColor="textSecondary">
          Les ventes, la caisse, le stock et la comptabilité arrivent dans les prochaines versions. Les boutiques et les
          membres se gèrent pour l&apos;instant depuis l&apos;application web.
        </ThemedText>
      </Carte>
      <View style={{ height: BottomTabInset }} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: Spacing.one, marginTop: Spacing.three, marginBottom: Spacing.two },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tuile: { flexBasis: '48%', flexGrow: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  montant: { fontSize: 20, lineHeight: 28, fontVariant: ['tabular-nums'] },
});
