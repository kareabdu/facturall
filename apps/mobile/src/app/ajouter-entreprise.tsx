import { router } from 'expo-router';

import { FormulaireEntreprise } from '@/components/formulaire-entreprise';

/** Entreprise supplémentaire, ouverte depuis les réglages. */
export default function AjouterEntreprise() {
  return <FormulaireEntreprise titre="Nouvelle entreprise" onCree={() => router.back()} />;
}
