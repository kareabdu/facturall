import { Bouton } from '@/components/formulaire';
import { FormulaireEntreprise } from '@/components/formulaire-entreprise';
import { oublierEspace } from '@/lib/espace';
import { supabase } from '@/lib/supabase';
import { View } from 'react-native';

/** Première connexion : l'utilisateur n'appartient encore à aucune entreprise. */
export default function NouvelleEntreprise() {
  return (
    <View style={{ flex: 1 }}>
      <FormulaireEntreprise titre="Bienvenue ! Créons votre entreprise" />
      <View style={{ padding: 16, paddingBottom: 32 }}>
        <Bouton
          titre="Se déconnecter"
          variante="secondaire"
          onPress={() => {
            oublierEspace();
            void supabase.auth.signOut();
          }}
        />
      </View>
    </View>
  );
}
