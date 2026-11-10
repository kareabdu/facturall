import "react-native-url-polyfill/auto";
import "@/lib/stockage";

import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Variables EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY manquantes (apps/mobile/.env).",
  );
}

/**
 * Client Supabase mobile. La session est conservée dans SQLite (localStorage d'expo-sqlite).
 * La sécurité des données repose sur la RLS de la base, pas sur ce client.
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: globalThis.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Sur mobile, on ne rafraîchit le jeton que lorsque l'application est au premier plan.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (etat) => {
    if (etat === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
