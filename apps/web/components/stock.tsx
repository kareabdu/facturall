"use client";

import { formaterQuantite, LIBELLES_NIVEAUX, niveauStock, type Article } from "@facturall/core";

import { Badge, Liste } from "@/components/ui";

/** Composants communs du module stock. */

export function BadgeNiveau({ quantite, seuil }: { quantite: number; seuil: number | null | undefined }) {
  const niveau = niveauStock(quantite, seuil);
  const ton = { rupture: "rouge", bas: "orange", normal: "vert" } as const;
  return <Badge ton={ton[niveau]}>{LIBELLES_NIVEAUX[niveau]}</Badge>;
}

/** Quantité signée : +3 en vert, −2 en rouge */
export function QuantiteSignee({ valeur, unite }: { valeur: number; unite?: string }) {
  return (
    <span className={`montant whitespace-nowrap font-medium ${valeur > 0 ? "text-primary" : "text-danger"}`}>
      {valeur > 0 ? "+" : "−"}
      {formaterQuantite(Math.abs(valeur))}
      {unite && <span className="ml-1 text-xs font-normal text-muted">{unite}</span>}
    </span>
  );
}

export function ChoixArticleStock({
  articles,
  valeur,
  onChange,
  libelle,
  exclure,
  disponibilites,
}: {
  articles: Article[];
  valeur: string;
  onChange: (id: string) => void;
  libelle?: string;
  /** Articles déjà choisis ailleurs (masqués) */
  exclure?: Set<string>;
  /** Quantités disponibles, affichées dans la liste */
  disponibilites?: Map<string, number>;
}) {
  return (
    <Liste libelle={libelle} aria-label={libelle ? undefined : "Article"} value={valeur} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choisir un article…</option>
      {articles
        .filter((a) => a.actif && (a.id === valeur || !exclure?.has(a.id)))
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.designation}
            {a.reference ? ` (${a.reference})` : ""}
            {disponibilites ? ` — ${formaterQuantite(disponibilites.get(a.id) ?? 0)} ${a.unite}` : ""}
          </option>
        ))}
    </Liste>
  );
}
