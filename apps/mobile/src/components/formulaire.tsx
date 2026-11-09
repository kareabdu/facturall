import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Couleurs, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** Écran défilant, sûr vis-à-vis du clavier et des encoches. */
export function Ecran({ children, onglets = false }: { children: ReactNode; onglets?: boolean }) {
  return (
    <ThemedView style={styles.ecran}>
      <SafeAreaView style={styles.safe} edges={onglets ? ["top"] : ["top", "bottom"]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

export function Champ({ libelle, aide, ...props }: TextInputProps & { libelle: string; aide?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.champ}>
      <ThemedText type="smallBold">{libelle}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        {...props}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      {aide && (
        <ThemedText type="small" themeColor="textSecondary">
          {aide}
        </ThemedText>
      )}
    </View>
  );
}

export function Bouton({
  titre,
  onPress,
  chargement = false,
  variante = "primaire",
}: {
  titre: string;
  onPress: () => void;
  chargement?: boolean;
  variante?: "primaire" | "secondaire" | "danger";
}) {
  const theme = useTheme();
  const fond = variante === "primaire" ? Couleurs.primaire : theme.backgroundElement;
  const texte = variante === "primaire" ? "#ffffff" : variante === "danger" ? Couleurs.danger : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={chargement}
      style={({ pressed }) => [styles.bouton, { backgroundColor: fond, opacity: pressed || chargement ? 0.7 : 1 }]}
    >
      {chargement ? (
        <ActivityIndicator color={texte} />
      ) : (
        <ThemedText type="smallBold" style={{ color: texte }}>
          {titre}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Lien({ titre, onPress }: { titre: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}>
      <ThemedText type="smallBold" style={{ color: Couleurs.primaire, textAlign: "center" }}>
        {titre}
      </ThemedText>
    </Pressable>
  );
}

export function Alerte({ children, type = "erreur" }: { children: ReactNode; type?: "erreur" | "succes" }) {
  return (
    <View style={[styles.alerte, type === "erreur" ? styles.alerteErreur : styles.alerteSucces]}>
      <ThemedText type="small" style={{ color: type === "erreur" ? Couleurs.danger : Couleurs.primaire }}>
        {children}
      </ThemedText>
    </View>
  );
}

/** Choix parmi quelques options (pays, forme juridique…) sous forme de pastilles. */
export function Pastilles<T extends string>({
  libelle,
  options,
  valeur,
  onChange,
}: {
  libelle: string;
  options: readonly { code: T; libelle: string }[];
  valeur: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.champ}>
      <ThemedText type="smallBold">{libelle}</ThemedText>
      <View style={styles.pastilles}>
        {options.map((o) => {
          const choisi = o.code === valeur;
          return (
            <Pressable
              key={o.code}
              onPress={() => onChange(o.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: choisi }}
              style={[
                styles.pastille,
                { backgroundColor: choisi ? Couleurs.primaire : theme.backgroundElement },
              ]}
            >
              <ThemedText type="small" style={{ color: choisi ? "#ffffff" : theme.text }}>
                {o.libelle}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Carte({ titre, children }: { titre?: string; children: ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.carte}>
      {titre && <ThemedText type="smallBold">{titre}</ThemedText>}
      {children}
    </ThemedView>
  );
}

export function ChargementPlein() {
  return (
    <ThemedView style={[styles.ecran, styles.centre]}>
      <ActivityIndicator color={Couleurs.primaire} size="large" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  ecran: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center" },
  safe: { flex: 1 },
  contenu: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingBottom: Spacing.six * 2,
  },
  champ: { gap: Spacing.one + Spacing.half },
  input: {
    height: 48,
    borderRadius: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  bouton: {
    height: 50,
    borderRadius: Spacing.two + Spacing.one,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  alerte: { borderRadius: Spacing.two, padding: Spacing.three },
  alerteErreur: { backgroundColor: "#fef3f2" },
  alerteSucces: { backgroundColor: "#e6f2ed" },
  pastilles: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  pastille: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999 },
  carte: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
