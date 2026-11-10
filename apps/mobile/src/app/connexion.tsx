import { traduireErreur, validerEmail } from '@facturall/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Alerte, Bouton, Champ, Ecran, Lien, Logo } from '@/components/formulaire';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function Connexion() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function seConnecter() {
    const invalide = validerEmail(email) ?? (motDePasse ? null : 'Saisissez votre mot de passe.');
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEnvoi(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
    setEnvoi(false);
    if (error) setErreur(traduireErreur(error));
    // En cas de succès, la navigation protégée bascule toute seule.
  }

  return (
    <Ecran>
      <View style={styles.entete}>
        <Logo taille={40} />
        <ThemedText type="subtitle" style={styles.titre}>
          Bon retour
        </ThemedText>
        <ThemedText themeColor="textSecondary">Gestion commerciale et comptabilité SYSCOHADA, en FCFA.</ThemedText>
      </View>

      {erreur && <Alerte>{erreur}</Alerte>}

      <Champ
        libelle="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Champ
        libelle="Mot de passe"
        value={motDePasse}
        onChangeText={setMotDePasse}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={seConnecter}
      />
      <Bouton titre="Se connecter" onPress={seConnecter} chargement={envoi} />
      <Lien titre="Créer un compte" onPress={() => router.push('/inscription')} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        Mot de passe oublié ? Réinitialisez-le depuis l&apos;application web.
      </ThemedText>
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: Spacing.two, marginTop: Spacing.five, marginBottom: Spacing.three },
  titre: { marginTop: Spacing.four },
  note: { textAlign: 'center' },
});
