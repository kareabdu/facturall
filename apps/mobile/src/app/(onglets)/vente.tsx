import {
  chargerArticles,
  chargerClients,
  chargerDisponibilites,
  chargerJournaux,
  chargerTauxTva,
  clientComptoir,
  encaisserVente,
  formaterQuantite,
  formaterXOF,
  journalPourMode,
  lireMontantXOF,
  modifierPanier,
  MODES_CAISSE,
  texteTicket,
  totauxPanier,
  type Article,
  type Client,
  type Journal,
  type LignePanier,
  type ModeReglement,
  type TauxTva,
} from '@facturall/core';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';

import { Alerte, Bouton, Carte, Ecran, Pastilles } from '@/components/formulaire';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Rayons, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useEspace } from '@/lib/espace';
import { supabase } from '@/lib/supabase';

interface Donnees {
  articles: Article[];
  clients: Client[];
  taux: TauxTva[];
  journaux: Journal[];
  dispo: Map<string, number>;
}

interface VenteTerminee {
  numero: string;
  ttc: number;
  rendu: number;
  reste: number;
  ticket: string;
}

/** Montants « ronds » proposés pour un paiement en espèces (billets courants en FCFA). */
function montantsRapides(total: number): number[] {
  const paliers = [500, 1000, 2000, 5000, 10000];
  const propositions = new Set<number>([total]);
  for (const p of paliers) {
    const arrondi = Math.ceil(total / p) * p;
    if (arrondi > total) propositions.add(arrondi);
  }
  return [...propositions].sort((a, b) => a - b).slice(0, 4);
}

/** Vente au comptoir : choisir les articles, encaisser, partager le ticket. */
export default function Vente() {
  const theme = useTheme();
  const { entreprise, boutique } = useEspace();
  const eid = entreprise?.entreprise_id;
  const bid = boutique?.id;

  const [version, setVersion] = useState(0);
  const cle = `${eid}|${bid}|${version}`;
  const [resultat, setResultat] = useState<{ cle: string; donnees: Donnees } | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const [panier, setPanier] = useState<LignePanier[]>([]);
  const [recherche, setRecherche] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [rechercheClient, setRechercheClient] = useState<string | null>(null);
  const [mode, setMode] = useState<ModeReglement>('especes');
  const [recuTexte, setRecuTexte] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [terminee, setTerminee] = useState<VenteTerminee | null>(null);

  useEffect(() => {
    if (!eid || !bid) return;
    let actif = true;
    Promise.all([
      chargerArticles(supabase, eid),
      chargerClients(supabase, eid),
      chargerTauxTva(supabase, eid),
      chargerJournaux(supabase, eid),
      chargerDisponibilites(supabase, eid, bid),
    ])
      .then(([articles, clients, taux, journaux, dispo]) => {
        if (actif) setResultat({ cle, donnees: { articles: articles.filter((a) => a.actif), clients, taux, journaux, dispo } });
      })
      .catch((e: Error) => actif && setErreurChargement(e.message));
    return () => {
      actif = false;
    };
  }, [eid, bid, cle]);

  const donnees = resultat?.cle === cle ? resultat.donnees : null;
  const totaux = useMemo(() => totauxPanier(panier, donnees?.taux ?? []), [panier, donnees]);
  const comptoir = donnees ? clientComptoir(donnees.clients) : undefined;
  const client = donnees?.clients.find((c) => c.id === clientId) ?? comptoir;
  const modes = donnees ? MODES_CAISSE.filter((m) => journalPourMode(donnees.journaux, m.mode)) : [];

  const articles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const liste = donnees?.articles ?? [];
    return q
      ? liste.filter((a) => a.designation.toLowerCase().includes(q) || a.reference?.toLowerCase().includes(q))
      : liste;
  }, [donnees, recherche]);

  const clientsTrouves = useMemo(() => {
    if (rechercheClient === null || !donnees) return [];
    const q = rechercheClient.trim().toLowerCase();
    return donnees.clients
      .filter((c) => c.actif && (!q || c.nom.toLowerCase().includes(q) || c.telephone?.includes(q) || c.code.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [donnees, rechercheClient]);

  if (!bid) {
    return (
      <Ecran onglets>
        <ThemedText type="subtitle" style={styles.titre}>
          Vendre
        </ThemedText>
        <Alerte>Choisissez une boutique dans les réglages pour vendre.</Alerte>
      </Ecran>
    );
  }

  const especes = mode === 'especes';
  const recu = especes ? (lireMontantXOF(recuTexte) ?? totaux.ttc) : totaux.ttc;
  const encaisse = Math.min(recu, totaux.ttc);
  const rendu = Math.max(0, recu - totaux.ttc);
  const reste = totaux.ttc - encaisse;

  function quantiteDans(a: Article) {
    return panier.find((l) => l.article.id === a.id)?.quantite ?? 0;
  }

  function nouvelleVente() {
    setPanier([]);
    setClientId(null);
    setRechercheClient(null);
    setRecuTexte('');
    setMode('especes');
    setErreur(null);
    setTerminee(null);
  }

  async function encaisser() {
    if (!eid || !bid || !donnees || !client) return;
    const journal = journalPourMode(donnees.journaux, mode);
    const invalide =
      (panier.length === 0 ? 'Ajoutez au moins un article.' : null) ??
      (!journal ? 'Aucun journal de trésorerie pour ce mode de paiement.' : null) ??
      (reste > 0 && client.id === comptoir?.id
        ? 'Paiement partiel : choisissez le client à qui faire crédit.'
        : null);
    if (invalide || !journal) return setErreur(invalide);
    setErreur(null);
    setEnvoi(true);
    try {
      const { numero } = await encaisserVente(supabase, {
        entrepriseId: eid,
        boutiqueId: bid,
        clientId: client.id,
        panier,
        taux: donnees.taux,
        mode,
        journalId: journal.id,
        montantEncaisse: encaisse,
      });
      const ticket = texteTicket({
        entreprise: { nom: entreprise?.sigle || entreprise?.raison_sociale || 'FacturAll' },
        boutique: boutique?.nom,
        numero,
        client: client.id === comptoir?.id ? null : client.nom,
        lignes: totaux.lignes.map((l) => ({ designation: l.article.designation, quantite: l.quantite, ttc: l.ttc })),
        ht: totaux.ht,
        tva: totaux.tva,
        ttc: totaux.ttc,
        modeLibelle: MODES_CAISSE.find((m) => m.mode === mode)?.libelle ?? 'Payé',
        recu: especes ? recu : encaisse,
        rendu,
        reste,
      });
      setTerminee({ numero, ttc: totaux.ttc, rendu, reste, ticket });
      setVersion((v) => v + 1); // recharge les stocks disponibles
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  // ---------------------------------------------------------------- Vente terminée
  if (terminee) {
    return (
      <Ecran onglets>
        <View style={[styles.succes, { backgroundColor: theme.panneau }]}>
          <View style={[styles.coche, { backgroundColor: theme.accent }]}>
            <ThemedText style={{ color: '#04130D', fontSize: 28, lineHeight: 34, fontWeight: 700 }}>✓</ThemedText>
          </View>
          <ThemedText type="small" style={{ color: theme.panneauTextSecondary }}>
            Vente enregistrée · {terminee.numero}
          </ThemedText>
          <ThemedText style={styles.grandChiffre}>{formaterXOF(terminee.ttc)}</ThemedText>
          {terminee.rendu > 0 && (
            <View style={[styles.rendu, { backgroundColor: 'rgba(32,201,151,0.16)' }]}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Rendre {formaterXOF(terminee.rendu)}
              </ThemedText>
            </View>
          )}
          {terminee.reste > 0 && (
            <ThemedText type="small" style={{ color: '#FFC078' }}>
              Reste à payer : {formaterXOF(terminee.reste)}
            </ThemedText>
          )}
        </View>

        <Carte titre="Ticket">
          <ThemedText style={[styles.ticket, { color: theme.text }]}>{terminee.ticket}</ThemedText>
        </Carte>

        <Bouton titre="Partager le ticket" variante="secondaire" onPress={() => void Share.share({ message: terminee.ticket })} />
        <Bouton titre="Nouvelle vente" onPress={nouvelleVente} />
        <View style={{ height: BottomTabInset }} />
      </Ecran>
    );
  }

  // ---------------------------------------------------------------- Saisie
  return (
    <Ecran onglets>
      <View style={styles.entete}>
        <ThemedText type="subtitle">Vendre</ThemedText>
        <ThemedText themeColor="textSecondary">{boutique?.nom}</ThemedText>
      </View>

      {erreurChargement && <Alerte>{erreurChargement}</Alerte>}

      <TextInput
        value={recherche}
        onChangeText={setRecherche}
        placeholder="Rechercher un article…"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      />

      {!donnees ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: Spacing.five }} />
      ) : articles.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {recherche ? 'Aucun article trouvé.' : 'Aucun article : créez votre catalogue depuis le web (Ventes → Articles).'}
        </ThemedText>
      ) : (
        <View style={styles.grille}>
          {articles.map((a) => {
            const qte = quantiteDans(a);
            const dispo = a.suivi_stock ? (donnees.dispo.get(a.id) ?? 0) : null;
            const epuise = dispo !== null && dispo - qte <= 0;
            return (
              <Pressable
                key={a.id}
                onPress={() => setPanier((p) => modifierPanier(p, a, 1))}
                accessibilityRole="button"
                accessibilityLabel={`${a.designation}, ${formaterXOF(a.prix_vente)}${qte ? `, ${formaterQuantite(qte)} au panier` : ''}`}
                style={({ pressed }) => [
                  styles.tuile,
                  {
                    backgroundColor: qte ? theme.primarySoft : theme.backgroundElement,
                    borderColor: qte ? theme.primary : theme.border,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  },
                ]}>
                <ThemedText type="smallBold" numberOfLines={2} style={{ minHeight: 40 }}>
                  {a.designation}
                </ThemedText>
                <ThemedText style={[styles.prix, { color: theme.text }]}>{formaterXOF(a.prix_vente)}</ThemedText>
                {dispo !== null && (
                  <ThemedText type="small" style={{ color: epuise ? theme.danger : theme.textSecondary, fontSize: 12 }}>
                    {epuise ? 'Stock épuisé' : `Stock : ${formaterQuantite(dispo - qte)} ${a.unite}`}
                  </ThemedText>
                )}
                {qte > 0 && (
                  <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                    <ThemedText type="smallBold" style={{ color: theme.onPrimary, fontSize: 12 }}>
                      {formaterQuantite(qte)}
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {panier.length > 0 && donnees && (
        <>
          <Carte titre={`Panier · ${formaterQuantite(totaux.articles)} article(s)`}>
            {totaux.lignes.map((l) => (
              <View key={l.article.id} style={styles.lignePanier}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="small" numberOfLines={1}>
                    {l.article.designation}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                    {formaterXOF(l.article.prix_vente, { symbole: false })} × {formaterQuantite(l.quantite)}
                  </ThemedText>
                </View>
                <View style={styles.compteur}>
                  <BoutonRond libelle="−" onPress={() => setPanier((p) => modifierPanier(p, l.article, -1))} />
                  <ThemedText type="smallBold" style={styles.quantite}>
                    {formaterQuantite(l.quantite)}
                  </ThemedText>
                  <BoutonRond libelle="+" onPress={() => setPanier((p) => modifierPanier(p, l.article, 1))} />
                </View>
                <ThemedText type="smallBold" style={styles.montantLigne}>
                  {formaterXOF(l.ttc, { symbole: false })}
                </ThemedText>
              </View>
            ))}
            <View style={[styles.total, { borderTopColor: theme.border }]}>
              <ThemedText type="smallBold">Total TTC</ThemedText>
              <ThemedText style={styles.prixTotal}>{formaterXOF(totaux.ttc)}</ThemedText>
            </View>
            {totaux.tva > 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'right', fontSize: 12 }}>
                dont TVA {formaterXOF(totaux.tva)}
              </ThemedText>
            )}
          </Carte>

          {/* Client : « Clients divers » par défaut */}
          <View style={styles.champ}>
            <ThemedText type="smallBold">Client</ThemedText>
            {rechercheClient === null ? (
              <Pressable
                onPress={() => setRechercheClient('')}
                style={[styles.choisi, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText style={{ flex: 1 }}>{client?.nom ?? '—'}</ThemedText>
                <ThemedText type="small" style={{ color: theme.primary }}>
                  Changer
                </ThemedText>
              </Pressable>
            ) : (
              <>
                <TextInput
                  autoFocus
                  value={rechercheClient}
                  onChangeText={setRechercheClient}
                  placeholder="Nom, téléphone ou code…"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.primary }]}
                />
                {clientsTrouves.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setClientId(c.id);
                      setRechercheClient(null);
                    }}
                    style={({ pressed }) => [styles.ligneClient, pressed && { opacity: 0.6 }]}>
                    <ThemedText type="small" style={{ flex: 1 }}>
                      {c.nom}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {c.telephone ?? c.code}
                    </ThemedText>
                  </Pressable>
                ))}
              </>
            )}
          </View>

          <Pastilles
            libelle="Paiement"
            options={modes.map((m) => ({ code: m.mode, libelle: m.libelle }))}
            valeur={mode}
            onChange={setMode}
          />

          {especes && (
            <View style={styles.champ}>
              <ThemedText type="smallBold">Montant reçu</ThemedText>
              <TextInput
                value={recuTexte}
                onChangeText={(t) => setRecuTexte(t.replace(/[^\d\s]/g, ''))}
                keyboardType="number-pad"
                placeholder={formaterXOF(totaux.ttc, { symbole: false })}
                placeholderTextColor={theme.textSecondary}
                style={[styles.montantRecu, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
              />
              <View style={styles.rapides}>
                {montantsRapides(totaux.ttc).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setRecuTexte(formaterXOF(m, { symbole: false }))}
                    style={[styles.rapide, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="small">{formaterXOF(m, { symbole: false })}</ThemedText>
                  </Pressable>
                ))}
              </View>
              {rendu > 0 && (
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  À rendre : {formaterXOF(rendu)}
                </ThemedText>
              )}
              {reste > 0 && (
                <ThemedText type="smallBold" style={{ color: theme.warning }}>
                  Reste à payer (crédit) : {formaterXOF(reste)}
                </ThemedText>
              )}
            </View>
          )}

          {erreur && <Alerte>{erreur}</Alerte>}
          <Bouton titre={`Encaisser ${formaterXOF(totaux.ttc)}`} onPress={encaisser} chargement={envoi} />
          <Bouton titre="Vider le panier" variante="secondaire" onPress={nouvelleVente} />
        </>
      )}
      <View style={{ height: BottomTabInset }} />
    </Ecran>
  );
}

function BoutonRond({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={libelle === '+' ? 'Ajouter un' : 'Retirer un'}
      style={({ pressed }) => [styles.rond, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
      <ThemedText type="smallBold" style={{ fontSize: 18, lineHeight: 20 }}>
        {libelle}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titre: { marginTop: Spacing.three, marginBottom: Spacing.one },
  entete: { gap: Spacing.half, marginTop: Spacing.two },
  input: { height: 48, borderRadius: Rayons.moyen, borderWidth: 1, paddingHorizontal: Spacing.three, fontSize: 16 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tuile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: Rayons.grand,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  prix: { fontSize: 16, lineHeight: 22, fontWeight: 700, fontVariant: ['tabular-nums'] },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lignePanier: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  compteur: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  quantite: { minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rond: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  montantLigne: { minWidth: 72, textAlign: 'right', fontVariant: ['tabular-nums'] },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
  },
  prixTotal: { fontSize: 22, lineHeight: 28, fontWeight: 700, fontVariant: ['tabular-nums'] },
  champ: { gap: Spacing.one + Spacing.half },
  choisi: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Rayons.moyen,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  ligneClient: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two, gap: Spacing.two },
  montantRecu: {
    height: 60,
    borderRadius: Rayons.moyen,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  rapides: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  rapide: { borderWidth: 1, borderRadius: Rayons.plein, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  succes: { borderRadius: Rayons.grand + 8, padding: Spacing.four, gap: Spacing.two, alignItems: 'center', marginTop: Spacing.three },
  coche: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  grandChiffre: { color: '#FFFFFF', fontSize: 32, lineHeight: 40, fontWeight: 700, fontVariant: ['tabular-nums'] },
  rendu: { borderRadius: Rayons.plein, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  ticket: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, lineHeight: 17 },
});
