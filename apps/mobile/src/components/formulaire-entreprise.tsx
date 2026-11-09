import {
  creerEntreprise,
  FORMES_JURIDIQUES,
  libelleIdentifiantFiscal,
  PAYS_UEMOA,
  validerNouvelleEntreprise,
  type NouvelleEntreprise,
} from '@facturall/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Alerte, Bouton, Champ, Ecran, Pastilles } from '@/components/formulaire';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { memoriserEntreprise, useEspace } from '@/lib/espace';
import { supabase } from '@/lib/supabase';

const FORMES = FORMES_JURIDIQUES.filter((f) => ['EI', 'SARL', 'SARLU', 'SA', 'SAS', 'GIE', 'AUTRE'].includes(f.code));

/** Formulaire de création d'entreprise (première entreprise ou entreprise supplémentaire). */
export function FormulaireEntreprise({ titre, onCree }: { titre: string; onCree?: () => void }) {
  const { rafraichir } = useEspace();
  const [f, setF] = useState<NouvelleEntreprise>({ raison_sociale: '', pays: 'SN', forme_juridique: 'SARL' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const maj = (champ: keyof NouvelleEntreprise) => (v: string) => setF((x) => ({ ...x, [champ]: v }));

  async function creer() {
    const invalide = validerNouvelleEntreprise(f);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEnvoi(true);
    try {
      const id = await creerEntreprise(supabase, f);
      memoriserEntreprise(id);
      await rafraichir();
      onCree?.();
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(false);
    }
  }

  return (
    <Ecran>
      <View style={styles.entete}>
        <ThemedText type="subtitle">{titre}</ThemedText>
        <ThemedText themeColor="textSecondary">
          Comptabilité SYSCOHADA révisé en FCFA. Vous pourrez compléter ces informations plus tard.
        </ThemedText>
      </View>

      {erreur && <Alerte>{erreur}</Alerte>}

      <Champ libelle="Raison sociale *" value={f.raison_sociale} onChangeText={maj('raison_sociale')} placeholder="Ex. : Diop Commerce SARL" />
      <Pastilles
        libelle="Pays *"
        options={PAYS_UEMOA.map((p) => ({ code: p.code as string, libelle: p.nom }))}
        valeur={f.pays}
        onChange={maj('pays')}
      />
      <Pastilles
        libelle="Forme juridique"
        options={FORMES.map((x) => ({ code: x.code as string, libelle: x.libelle }))}
        valeur={f.forme_juridique ?? 'SARL'}
        onChange={maj('forme_juridique')}
      />
      <Champ libelle="Ville" value={f.ville ?? ''} onChangeText={maj('ville')} />
      <Champ libelle="Téléphone" value={f.telephone ?? ''} onChangeText={maj('telephone')} keyboardType="phone-pad" />
      <Champ libelle="N° RCCM" value={f.rccm ?? ''} onChangeText={maj('rccm')} autoCapitalize="characters" />
      <Champ
        libelle={libelleIdentifiantFiscal(f.pays)}
        value={f.identifiant_fiscal ?? ''}
        onChangeText={maj('identifiant_fiscal')}
        autoCapitalize="characters"
      />
      <Champ
        libelle="Nom de la première boutique"
        value={f.nom_boutique ?? ''}
        onChangeText={maj('nom_boutique')}
        placeholder="Boutique principale"
      />
      <Bouton titre="Créer l'entreprise" onPress={creer} chargement={envoi} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: Spacing.two, marginTop: Spacing.four, marginBottom: Spacing.two },
});
