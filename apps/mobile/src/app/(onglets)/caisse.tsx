import {
  aujourdhui,
  categoriesOperation,
  chargerComptes,
  chargerTresorerie,
  enregistrerOperationSimple,
  formaterDate,
  formaterXOF,
  lireMontantXOF,
  peutSaisirCompta,
  TYPES_TRESORERIE,
  type Compte,
  type Journal,
  type MouvementTresorerie,
  type SoldeTresorerie,
} from '@facturall/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Alerte, Bouton, Carte, Champ, Ecran, Pastilles } from '@/components/formulaire';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useEspace } from '@/lib/espace';
import { supabase } from '@/lib/supabase';

type Sens = 'recette' | 'depense';

const ORIGINES: Record<string, string> = {
  simple: 'Saisie caisse',
  reglement: 'Règlement client',
  paiement_fournisseur: 'Paiement fournisseur',
  manuelle: 'Écriture',
};

/** Saisie simplifiée : une recette ou une dépense en quelques secondes. */
export default function Caisse() {
  const theme = useTheme();
  const { entreprise, boutique, role } = useEspace();
  const entrepriseId = entreprise?.entreprise_id;

  const [comptes, setComptes] = useState<Compte[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [soldes, setSoldes] = useState<SoldeTresorerie[]>([]);
  const [mouvements, setMouvements] = useState<MouvementTresorerie[]>([]);
  const [sens, setSens] = useState<Sens>('depense');
  const [montantTexte, setMontantTexte] = useState('');
  const [journalId, setJournalId] = useState('');
  const [compteId, setCompteId] = useState('');
  const [recherche, setRecherche] = useState('');
  const [libelle, setLibelle] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    if (!entrepriseId) return;
    try {
      const [c, t] = await Promise.all([chargerComptes(supabase, entrepriseId), chargerTresorerie(supabase, entrepriseId)]);
      const j = t.journaux;
      setComptes(c);
      setJournaux(j);
      setSoldes(t.soldes);
      setMouvements(t.mouvements);
      setJournalId((actuel) => actuel || (j.find((x) => x.type === 'caisse')?.id ?? ''));
    } catch (err) {
      setErreur((err as Error).message);
    }
  }, [entrepriseId]);

  useEffect(() => {
    // Chargement asynchrone : les setState ont lieu après la requête (même convention que le web)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  const tresoreries = journaux.filter((j) => j.actif && TYPES_TRESORERIE.includes(j.type));
  const categories = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const liste = categoriesOperation(comptes, sens);
    return (q ? liste.filter((c) => c.numero.startsWith(q) || c.libelle.toLowerCase().includes(q)) : liste).slice(0, 8);
  }, [comptes, sens, recherche]);
  const choisie = comptes.find((c) => c.id === compteId);

  if (!peutSaisirCompta(role)) {
    return (
      <Ecran onglets>
        <Alerte>La saisie des recettes et dépenses est réservée à la comptabilité.</Alerte>
      </Ecran>
    );
  }

  async function enregistrer() {
    if (!entrepriseId) return;
    const montant = lireMontantXOF(montantTexte) ?? 0;
    const invalide =
      (montant <= 0 ? 'Saisissez un montant.' : null) ??
      (!journalId ? 'Choisissez la caisse, la banque ou le Mobile Money.' : null) ??
      (!compteId ? 'Choisissez une catégorie.' : null) ??
      (!libelle.trim() ? 'Décrivez l’opération.' : null);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setMessage(null);
    setEnvoi(true);
    try {
      await enregistrerOperationSimple(supabase, {
        entrepriseId,
        sens,
        date: aujourdhui(),
        montant,
        journalId,
        compteId,
        libelle: libelle.trim(),
        boutiqueId: boutique?.id ?? null,
      });
      setMessage(`${sens === 'recette' ? 'Recette' : 'Dépense'} de ${formaterXOF(montant)} enregistrée.`);
      setMontantTexte('');
      setLibelle('');
      setCompteId('');
      setRecherche('');
      await charger();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Ecran onglets>
      <ThemedText type="subtitle" style={styles.titre}>
        Caisse
      </ThemedText>

      <View style={[styles.bascule, { backgroundColor: theme.backgroundElement }]}>
        {(['recette', 'depense'] as const).map((s) => (
          <Pressable
            key={s}
            accessibilityRole="radio"
            accessibilityState={{ selected: sens === s }}
            onPress={() => {
              setSens(s);
              setCompteId('');
            }}
            style={[styles.option, sens === s && { backgroundColor: s === 'recette' ? theme.primary : theme.text }]}>
            <ThemedText type="smallBold" style={{ color: sens === s ? theme.background : theme.textSecondary }}>
              {s === 'recette' ? 'Recette' : 'Dépense'}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {/* Soldes de trésorerie (exercice courant, à-nouveaux compris) */}
      {soldes.length > 0 && (
        <View style={[styles.soldes, { backgroundColor: theme.panneau }]}>
          <ThemedText type="small" style={{ color: theme.panneauTextSecondary }}>
            Trésorerie disponible
          </ThemedText>
          <ThemedText style={styles.grandSolde}>{formaterXOF(soldes.reduce((t, s) => t + s.solde, 0))}</ThemedText>
          <View style={styles.lignesSoldes}>
            {soldes.map((s) => (
              <View key={s.journal.id} style={styles.ligneSolde}>
                <ThemedText type="small" style={{ color: theme.panneauTextSecondary, flex: 1 }} numberOfLines={1}>
                  {s.journal.libelle}
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: s.solde < 0 ? '#FF8787' : theme.panneauText, fontVariant: ['tabular-nums'] }}>
                  {formaterXOF(s.solde)}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}

      {erreur && <Alerte>{erreur}</Alerte>}
      {message && <Alerte type="succes">{message}</Alerte>}

      <View style={styles.champ}>
        <ThemedText type="smallBold">Montant (FCFA)</ThemedText>
        <TextInput
          value={montantTexte}
          onChangeText={(t) => setMontantTexte(t.replace(/[^\d\s]/g, ''))}
          onBlur={() => {
            const v = lireMontantXOF(montantTexte);
            if (v) setMontantTexte(formaterXOF(v, { symbole: false }));
          }}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.textSecondary}
          style={[styles.montant, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </View>

      <Pastilles
        libelle={sens === 'recette' ? 'Encaissé sur' : 'Payé depuis'}
        options={tresoreries.map((j) => ({ code: j.id, libelle: j.libelle }))}
        valeur={journalId}
        onChange={setJournalId}
      />

      <View style={styles.champ}>
        <ThemedText type="smallBold">Catégorie</ThemedText>
        {choisie ? (
          <Pressable onPress={() => setCompteId('')} style={[styles.choisie, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={{ flex: 1 }}>
              {choisie.numero} — {choisie.libelle}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.primary }}>
              Changer
            </ThemedText>
          </Pressable>
        ) : (
          <>
            <TextInput
              value={recherche}
              onChangeText={setRecherche}
              placeholder={sens === 'recette' ? 'Ex. : 701, ventes…' : 'Ex. : électricité, loyer, 6052…'}
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            {categories.map((c) => (
              <Pressable key={c.id} onPress={() => setCompteId(c.id)} style={({ pressed }) => [styles.ligne, pressed && { opacity: 0.6 }]}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.numero}>
                  {c.numero}
                </ThemedText>
                <ThemedText type="small" style={{ flex: 1 }}>
                  {c.libelle}
                </ThemedText>
              </Pressable>
            ))}
          </>
        )}
      </View>

      <Champ libelle="Libellé" value={libelle} onChangeText={setLibelle} placeholder="Ex. : Facture SENELEC octobre" />
      <Bouton titre="Enregistrer" onPress={enregistrer} chargement={envoi} />

      <Carte titre="Dernières opérations">
        {mouvements.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Aucune opération pour l’instant.
          </ThemedText>
        )}
        {mouvements.map(({ ecriture: e, journal, montant }) => {
          const entree = montant >= 0;
          return (
            <View key={e.id} style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <ThemedText type="small" numberOfLines={2}>
                  {e.libelle}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formaterDate(e.date_ecriture)} · {journal.libelle} · {ORIGINES[e.origine] ?? e.numero}
                </ThemedText>
              </View>
              <ThemedText type="smallBold" style={{ color: entree ? theme.primary : theme.text, fontVariant: ['tabular-nums'] }}>
                {entree ? '+' : '−'}
                {formaterXOF(Math.abs(montant))}
              </ThemedText>
            </View>
          );
        })}
      </Carte>
      <View style={{ height: BottomTabInset }} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titre: { marginTop: Spacing.three, marginBottom: Spacing.one },
  bascule: { flexDirection: 'row', borderRadius: Spacing.three, padding: Spacing.one, gap: Spacing.one },
  option: { flex: 1, height: 44, borderRadius: Spacing.two + Spacing.one, alignItems: 'center', justifyContent: 'center' },
  champ: { gap: Spacing.one + Spacing.half },
  montant: {
    height: 64,
    borderRadius: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    fontSize: 32,
    fontWeight: '600',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  input: { height: 48, borderRadius: Spacing.two + Spacing.one, paddingHorizontal: Spacing.three, fontSize: 16 },
  choisie: { flexDirection: 'row', alignItems: 'center', borderRadius: Spacing.two + Spacing.one, padding: Spacing.three, gap: Spacing.two },
  ligne: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two, gap: Spacing.two },
  numero: { width: 48, fontVariant: ['tabular-nums'] },
  soldes: { borderRadius: Spacing.four, padding: Spacing.four, gap: Spacing.one },
  grandSolde: { color: '#FFFFFF', fontSize: 28, lineHeight: 36, fontWeight: 700, fontVariant: ['tabular-nums'] },
  lignesSoldes: { gap: Spacing.one, marginTop: Spacing.one },
  ligneSolde: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
