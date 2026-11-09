import { LIBELLES_ROLES, nomPays } from '@facturall/core';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Bouton, Carte, Ecran } from '@/components/formulaire';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Couleurs, Spacing } from '@/constants/theme';
import { oublierEspace, useEspace, useSession } from '@/lib/espace';
import { supabase } from '@/lib/supabase';

function Ligne({ titre, detail, choisi, onPress }: { titre: string; detail?: string; choisi: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: choisi }}
      style={({ pressed }) => [styles.ligne, pressed && { opacity: 0.6 }]}
    >
      <View style={{ flex: 1 }}>
        <ThemedText>{titre}</ThemedText>
        {detail && (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        )}
      </View>
      {choisi && <ThemedText style={{ color: Couleurs.primaire }}>✓</ThemedText>}
    </Pressable>
  );
}

export default function Reglages() {
  const { session } = useSession();
  const { entreprises, entreprise, boutiques, boutique, choisirEntreprise, choisirBoutique } = useEspace();

  return (
    <Ecran onglets>
      <ThemedText type="subtitle" style={styles.titre}>
        Réglages
      </ThemedText>

      <Carte titre="Entreprise">
        {entreprises.map((e) => (
          <Ligne
            key={e.entreprise_id}
            titre={e.raison_sociale}
            detail={`${nomPays(e.pays)} · ${LIBELLES_ROLES[e.role]}`}
            choisi={e.entreprise_id === entreprise?.entreprise_id}
            onPress={() => choisirEntreprise(e.entreprise_id)}
          />
        ))}
        <Pressable onPress={() => router.push('/ajouter-entreprise')} style={styles.ligne}>
          <ThemedText type="smallBold" style={{ color: Couleurs.primaire }}>
            + Nouvelle entreprise
          </ThemedText>
        </Pressable>
      </Carte>

      <Carte titre="Boutique">
        {boutiques
          .filter((b) => b.active)
          .map((b) => (
            <Ligne
              key={b.id}
              titre={b.nom}
              detail={[b.code, b.ville].filter(Boolean).join(' · ')}
              choisi={b.id === boutique?.id}
              onPress={() => choisirBoutique(b.id)}
            />
          ))}
        {boutiques.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Aucune boutique ne vous est attribuée dans cette entreprise.
          </ThemedText>
        )}
      </Carte>

      <Carte titre="Compte">
        <ThemedText type="small" themeColor="textSecondary">
          {session?.user.email}
        </ThemedText>
      </Carte>

      <Bouton
        titre="Se déconnecter"
        variante="danger"
        onPress={() => {
          oublierEspace();
          void supabase.auth.signOut();
        }}
      />
      <View style={{ height: BottomTabInset }} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titre: { marginTop: Spacing.three, marginBottom: Spacing.two },
  ligne: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two, gap: Spacing.two },
});
