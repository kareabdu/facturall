import { traduireErreur, validerEmail, validerMotDePasse } from '@facturall/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Alerte, Bouton, Champ, Ecran, Lien, Logo } from '@/components/formulaire';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function Inscription() {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [aConfirmer, setAConfirmer] = useState(false);

  async function sInscrire() {
    const invalide =
      (nom.trim().length < 2 ? 'Saisissez votre nom.' : null) ?? validerEmail(email) ?? validerMotDePasse(motDePasse);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEnvoi(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: motDePasse,
      options: { data: { nom_complet: nom.trim() } },
    });
    setEnvoi(false);
    if (error) return setErreur(traduireErreur(error));
    if (!data.session) setAConfirmer(true);
  }

  if (aConfirmer) {
    return (
      <Ecran>
        <View style={styles.entete}>
          <ThemedText type="subtitle">Vérifiez votre e-mail</ThemedText>
          <ThemedText themeColor="textSecondary">
            Un lien de confirmation a été envoyé à {email.trim()}. Ouvrez-le, puis revenez vous connecter.
          </ThemedText>
        </View>
        <Bouton titre="Aller à la connexion" onPress={() => router.replace('/connexion')} />
      </Ecran>
    );
  }

  return (
    <Ecran>
      <View style={styles.entete}>
        <Logo taille={36} />
        <ThemedText type="subtitle" style={{ marginTop: Spacing.three }}>
          Créer un compte
        </ThemedText>
        <ThemedText themeColor="textSecondary">Vous créerez ensuite votre entreprise.</ThemedText>
      </View>

      {erreur && <Alerte>{erreur}</Alerte>}

      <Champ libelle="Nom complet" value={nom} onChangeText={setNom} autoComplete="name" textContentType="name" />
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
        autoComplete="new-password"
        textContentType="newPassword"
        aide="8 caractères minimum, avec lettres et chiffres."
      />
      <Bouton titre="Créer mon compte" onPress={sInscrire} chargement={envoi} />
      <Lien titre="J'ai déjà un compte" onPress={() => router.back()} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: Spacing.two, marginTop: Spacing.five, marginBottom: Spacing.three },
});
