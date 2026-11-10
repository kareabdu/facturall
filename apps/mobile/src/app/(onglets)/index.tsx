import {
  chargerResumeVentes,
  formaterDate,
  formaterXOF,
  LIBELLES_ROLES,
  type PointSerie,
  type ResumeVentes,
} from '@facturall/core';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Carte, Ecran } from '@/components/formulaire';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Rayons, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useEspace, useSession } from '@/lib/espace';
import { supabase } from '@/lib/supabase';

const COULEUR_SERIE = '#20C997'; // contraste ≥ 3:1 sur le panneau sombre

/** Barres fines des 30 derniers jours ; toucher une barre affiche le jour et le montant. */
function Barres({ serie, choisi, onChoisir }: { serie: PointSerie[]; choisi: number | null; onChoisir: (i: number | null) => void }) {
  const max = Math.max(1, ...serie.map((p) => p.montant));
  return (
    <View
      style={styles.barres}
      accessible
      accessibilityLabel={`Ventes par jour sur ${serie.length} jours, maximum ${formaterXOF(max)}`}>
      {serie.map((p, i) => {
        const h = p.montant > 0 ? Math.max(4, (p.montant / max) * 72) : 2;
        const actif = choisi === i || (choisi === null && i === serie.length - 1);
        return (
          <Pressable
            key={p.date}
            onPress={() => onChoisir(choisi === i ? null : i)}
            hitSlop={{ top: 24, bottom: 8 }}
            style={styles.colonne}
            accessibilityRole="button"
            accessibilityLabel={`${formaterDate(p.date)} : ${formaterXOF(p.montant)}`}>
            <View
              style={{
                height: h,
                borderRadius: 2,
                backgroundColor: COULEUR_SERIE,
                opacity: p.montant > 0 ? (actif ? 1 : 0.45) : 0.18,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function Variation({ valeur }: { valeur: number | null }) {
  const theme = useTheme();
  if (valeur === null) return null;
  const hausse = valeur >= 0;
  return (
    <View style={[styles.pilule, { backgroundColor: hausse ? 'rgba(32,201,151,0.16)' : 'rgba(255,135,135,0.16)' }]}>
      <ThemedText type="smallBold" style={{ color: hausse ? theme.accent : '#FF8787', fontSize: 12 }}>
        {hausse ? '↗ +' : '↘ −'}
        {Math.abs(valeur)} %
      </ThemedText>
    </View>
  );
}

export default function Accueil() {
  const theme = useTheme();
  const { session } = useSession();
  const { entreprise, boutique, role } = useEspace();
  const prenom = (session?.user.user_metadata?.nom_complet as string | undefined)?.split(' ')[0];
  const eid = entreprise?.entreprise_id;
  const cle = `${eid}|${boutique?.id}`;
  const [resultat, setResultat] = useState<{ cle: string; resume: ResumeVentes } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisi, setChoisi] = useState<number | null>(null);

  useEffect(() => {
    if (!eid) return;
    let actif = true;
    chargerResumeVentes(supabase, eid, { boutiqueId: boutique?.id })
      .then((resume) => actif && setResultat({ cle, resume }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [eid, boutique?.id, cle]);

  const resume = resultat?.cle === cle ? resultat.resume : null;
  const jour = resume ? resume.serie[choisi ?? resume.serie.length - 1] : null;

  return (
    <Ecran onglets>
      <View style={styles.entete}>
        <ThemedText themeColor="textSecondary">
          {entreprise?.sigle || entreprise?.raison_sociale} · {boutique?.nom ?? 'aucune boutique'}
        </ThemedText>
        <ThemedText type="subtitle">{prenom ? `Bonjour ${prenom} 👋` : 'Accueil'}</ThemedText>
      </View>

      {/* Bandeau sombre : ventes des 30 derniers jours */}
      <View style={[styles.bandeau, { backgroundColor: theme.panneau }]}>
        <View style={styles.halo} />
        <ThemedText type="small" style={{ color: theme.panneauTextSecondary }}>
          Ventes des 30 derniers jours · TTC
        </ThemedText>
        <View style={styles.ligneChiffre}>
          <ThemedText style={styles.grandChiffre}>{resume ? formaterXOF(resume.totalPeriode) : '…'}</ThemedText>
          {resume && <Variation valeur={resume.variation} />}
        </View>
        {erreur ? (
          <ThemedText type="small" style={{ color: theme.panneauTextSecondary }}>
            {erreur}
          </ThemedText>
        ) : resume ? (
          <>
            <Barres serie={resume.serie} choisi={choisi} onChoisir={setChoisi} />
            {jour && (
              <ThemedText type="small" style={{ color: theme.panneauTextSecondary }}>
                {choisi === null ? "Aujourd'hui" : formaterDate(jour.date)} :{' '}
                <ThemedText type="smallBold" style={{ color: theme.panneauText }}>
                  {formaterXOF(jour.montant)}
                </ThemedText>
              </ThemedText>
            )}
          </>
        ) : (
          <ActivityIndicator color={COULEUR_SERIE} style={{ height: 96 }} />
        )}
      </View>

      <View style={styles.grille}>
        <Carte style={styles.tuile}>
          <ThemedText type="small" themeColor="textSecondary">
            Ventes du jour
          </ThemedText>
          <ThemedText style={styles.montant}>{resume ? formaterXOF(resume.ventesDuJour) : '…'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {resume ? `${resume.facturesDuJour} facture(s)` : ' '}
          </ThemedText>
        </Carte>
        <Carte style={styles.tuile}>
          <ThemedText type="small" themeColor="textSecondary">
            À encaisser
          </ThemedText>
          <ThemedText style={[styles.montant, resume && resume.aEncaisser > 0 ? { color: theme.warning } : null]}>
            {resume ? formaterXOF(resume.aEncaisser) : '…'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Factures non réglées
          </ThemedText>
        </Carte>
      </View>

      <Carte titre="Dernières factures">
        {!resume ? (
          <ActivityIndicator color={theme.primary} />
        ) : resume.recentes.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Aucune facture sur les 30 derniers jours.
          </ThemedText>
        ) : (
          resume.recentes.map((f, i) => (
            <View key={f.id} style={[styles.facture, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <View style={[styles.pastilleIcone, { backgroundColor: theme.primarySoft }]}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  {(f.client || '?').slice(0, 1).toUpperCase()}
                </ThemedText>
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {f.client || 'Client'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {f.numero} · {formaterDate(f.date_document)}
                </ThemedText>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <ThemedText type="smallBold" style={styles.chiffres}>
                  {formaterXOF(f.total_ttc, { symbole: false })}
                </ThemedText>
                <ThemedText type="small" style={{ color: f.reste > 0 ? theme.warning : theme.primary, fontSize: 12 }}>
                  {f.reste > 0 ? `Reste ${formaterXOF(f.reste, { symbole: false })}` : 'Réglée'}
                </ThemedText>
              </View>
            </View>
          ))
        )}
      </Carte>

      {role && (
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Connecté en tant que {LIBELLES_ROLES[role].toLowerCase()}
        </ThemedText>
      )}
      <View style={{ height: BottomTabInset }} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  entete: { gap: Spacing.half, marginTop: Spacing.two },
  bandeau: {
    borderRadius: Rayons.grand + 8,
    padding: Spacing.three + Spacing.one,
    gap: Spacing.two,
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    right: -60,
    top: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(18,184,134,0.18)',
  },
  ligneChiffre: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
  grandChiffre: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: 700,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  pilule: { borderRadius: Rayons.plein, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  barres: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 2, marginTop: Spacing.two },
  colonne: { flex: 1, justifyContent: 'flex-end', height: '100%' },
  grille: { flexDirection: 'row', gap: Spacing.three },
  tuile: { flex: 1, gap: Spacing.half },
  montant: { fontSize: 19, lineHeight: 26, fontWeight: 700, fontVariant: ['tabular-nums'] },
  facture: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + Spacing.half },
  pastilleIcone: { width: 36, height: 36, borderRadius: Rayons.moyen, alignItems: 'center', justifyContent: 'center' },
  chiffres: { fontVariant: ['tabular-nums'] },
});
