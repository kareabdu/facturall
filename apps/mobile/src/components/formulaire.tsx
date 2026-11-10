import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Rayons, Spacing } from "@/constants/theme";
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

/** Monogramme FacturAll : un « F » en barres de grand livre et une pièce (même dessin que le web). */
export function Monogramme({ taille = 32 }: { taille?: number }) {
  const k = taille / 32;
  const barre = (x: number, y: number, l: number, h: number, opacite = 1) => ({
    position: "absolute" as const,
    left: x * k,
    top: y * k,
    width: l * k,
    height: h * k,
    borderRadius: 1.7 * k,
    backgroundColor: `rgba(255,255,255,${opacite})`,
  });
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: taille,
        height: taille,
        borderRadius: 9 * k,
        experimental_backgroundImage: "linear-gradient(135deg, #20C997, #087F5B)",
        backgroundColor: "#109C70",
      }}
    >
      <View style={barre(9, 7.5, 3.4, 17)} />
      <View style={barre(9, 7.5, 14, 3.4)} />
      <View style={barre(9, 14.3, 9, 3.4, 0.85)} />
      <View
        style={{
          position: "absolute",
          left: 19 * k,
          top: 19.2 * k,
          width: 5.2 * k,
          height: 5.2 * k,
          borderRadius: 2.6 * k,
          backgroundColor: "#D3F9E8",
        }}
      />
    </View>
  );
}

export function Logo({ taille = 32, inverse = false }: { taille?: number; inverse?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.logo} accessibilityRole="header" accessibilityLabel="FacturAll">
      <Monogramme taille={taille} />
      <ThemedText style={{ fontSize: taille * 0.62, lineHeight: taille, fontWeight: 700, color: inverse ? theme.panneauText : theme.text }}>
        Factur<ThemedText style={{ fontSize: taille * 0.62, lineHeight: taille, fontWeight: 700, color: inverse ? theme.accent : theme.primary }}>All</ThemedText>
      </ThemedText>
    </View>
  );
}

export function Champ({ libelle, aide, ...props }: TextInputProps & { libelle: string; aide?: string }) {
  const theme = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={styles.champ}>
      <ThemedText type="smallBold">{libelle}</ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        {...props}
        onFocus={(e) => {
          setFocus(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: focus ? theme.primary : theme.border,
          },
          props.style,
        ]}
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
  const fond = variante === "primaire" ? theme.primary : theme.backgroundElement;
  const texte = variante === "primaire" ? theme.onPrimary : variante === "danger" ? theme.danger : theme.text;
  const bordure = variante === "primaire" ? theme.primary : variante === "danger" ? theme.dangerSoft : theme.border;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={chargement}
      style={({ pressed }) => [
        styles.bouton,
        { backgroundColor: fond, borderColor: bordure, opacity: chargement ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      {chargement ? (
        <ActivityIndicator color={texte} />
      ) : (
        <ThemedText type="smallBold" style={{ color: texte, fontSize: 16 }}>
          {titre}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Lien({ titre, onPress }: { titre: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}>
      <ThemedText type="smallBold" style={{ color: theme.primary, textAlign: "center" }}>
        {titre}
      </ThemedText>
    </Pressable>
  );
}

export function Alerte({ children, type = "erreur" }: { children: ReactNode; type?: "erreur" | "succes" }) {
  const theme = useTheme();
  const erreur = type === "erreur";
  return (
    <View style={[styles.alerte, { backgroundColor: erreur ? theme.dangerSoft : theme.primarySoft }]}>
      <ThemedText type="small" style={{ color: erreur ? theme.danger : theme.primary }}>
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
                {
                  backgroundColor: choisi ? theme.primary : theme.backgroundElement,
                  borderColor: choisi ? theme.primary : theme.border,
                },
              ]}
            >
              <ThemedText type="small" style={{ color: choisi ? theme.onPrimary : theme.text }}>
                {o.libelle}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Carte({ titre, children, style }: { titre?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.carte, { borderColor: theme.border }, style]}>
      {titre && <ThemedText type="smallBold">{titre}</ThemedText>}
      {children}
    </ThemedView>
  );
}

export function ChargementPlein() {
  const theme = useTheme();
  return (
    <ThemedView style={[styles.ecran, styles.centre]}>
      <ActivityIndicator color={theme.primary} size="large" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  ecran: { flex: 1 },
  centre: { alignItems: "center", justifyContent: "center" },
  safe: { flex: 1 },
  contenu: {
    padding: Spacing.three + Spacing.one,
    gap: Spacing.three,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingBottom: Spacing.six * 2,
  },
  logo: { flexDirection: "row", alignItems: "center", gap: Spacing.two + Spacing.half },
  champ: { gap: Spacing.one + Spacing.half },
  input: {
    height: 50,
    borderRadius: Rayons.moyen,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  bouton: {
    height: 52,
    borderRadius: Rayons.moyen + 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  alerte: { borderRadius: Rayons.moyen, padding: Spacing.three },
  pastilles: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  pastille: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Rayons.plein, borderWidth: 1 },
  carte: { borderRadius: Rayons.grand + 4, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
});
