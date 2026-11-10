"use client";

import { lirePreferenceTheme, memoriserPreferenceTheme, type PreferenceTheme } from "@facturall/core";
import { useSyncExternalStore } from "react";

/** Préférence d'apparence (auto / clair / sombre), partagée par tous les composants de la page. */

const EVENEMENT = "facturall:theme";

function abonner(rappel: () => void) {
  window.addEventListener(EVENEMENT, rappel);
  window.addEventListener("storage", rappel);
  return () => {
    window.removeEventListener(EVENEMENT, rappel);
    window.removeEventListener("storage", rappel);
  };
}

export function changerTheme(p: PreferenceTheme) {
  memoriserPreferenceTheme(p);
  if (p === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", p);
  window.dispatchEvent(new Event(EVENEMENT));
}

export function usePreferenceTheme(): PreferenceTheme {
  return useSyncExternalStore(abonner, lirePreferenceTheme, () => "auto");
}
