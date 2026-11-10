"use client";

import { formaterXOF, lireMontantXOF, type Compte } from "@facturall/core";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

/** Composants de saisie comptable. */

const styleChamp =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background";

/** Montant en FCFA : accepte « 1 250 000 », s'affiche formaté hors saisie. */
export function ChampMontant({
  valeur,
  onChange,
  libelle,
  placeholder = "0",
  disabled,
  className = "",
  ariaLabel,
}: {
  valeur: number;
  onChange: (v: number) => void;
  libelle?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [texte, setTexte] = useState<string | null>(null);
  const affiche = texte ?? (valeur ? formaterXOF(valeur, { symbole: false }) : "");
  const input = (
    <input
      inputMode="numeric"
      aria-label={ariaLabel ?? libelle}
      className={`${styleChamp} montant text-right ${libelle ? "" : className}`}
      value={affiche}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={(e) => {
        setTexte(valeur ? String(valeur) : "");
        // Tout sélectionner : taper un chiffre remplace le montant prérempli
        const champ = e.currentTarget;
        requestAnimationFrame(() => champ.select());
      }}
      onChange={(e) => {
        setTexte(e.target.value);
        const v = lireMontantXOF(e.target.value);
        onChange(v !== null && v >= 0 ? v : 0);
      }}
      onBlur={() => setTexte(null)}
    />
  );
  if (!libelle) return input;
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium">{libelle}</span>
      {input}
    </label>
  );
}

/** Choix d'un compte par numéro ou intitulé (liste filtrée au clavier). */
export function ChoixCompte({
  comptes,
  valeur,
  onChange,
  placeholder = "N° ou intitulé…",
  ariaLabel = "Compte",
  autoFocus,
}: {
  comptes: Compte[];
  valeur: string;
  onChange: (id: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [recherche, setRecherche] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const conteneur = useRef<HTMLDivElement>(null);
  const choisi = comptes.find((c) => c.id === valeur);

  const resultats = useMemo(() => {
    const q = (recherche ?? "").trim().toLowerCase();
    const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const liste = q
      ? comptes.filter((c) => c.numero.startsWith(q) || sansAccents(c.libelle).includes(sansAccents(q)))
      : comptes;
    return liste.slice(0, 50);
  }, [comptes, recherche]);

  function choisir(c: Compte) {
    onChange(c.id);
    setRecherche(null);
    setOuvert(false);
  }

  function clavier(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOuvert(true);
      setActif((a) => Math.min(a + 1, resultats.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && ouvert && resultats[actif]) {
      e.preventDefault();
      choisir(resultats[actif]);
    } else if (e.key === "Escape") {
      setOuvert(false);
      setRecherche(null);
    }
  }

  return (
    <div
      ref={conteneur}
      className="relative"
      onBlur={(e) => {
        if (!conteneur.current?.contains(e.relatedTarget as Node)) {
          setOuvert(false);
          setRecherche(null);
        }
      }}
    >
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={ouvert}
        aria-controls={id}
        autoFocus={autoFocus}
        className={styleChamp}
        placeholder={placeholder}
        value={recherche ?? (choisi ? `${choisi.numero} — ${choisi.libelle}` : "")}
        onFocus={(e) => {
          setOuvert(true);
          e.target.select();
        }}
        onChange={(e) => {
          setRecherche(e.target.value);
          setActif(0);
          setOuvert(true);
        }}
        onKeyDown={clavier}
      />
      {ouvert && (
        <ul
          id={id}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full min-w-72 overflow-auto rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
        >
          {resultats.length === 0 && <li className="px-3 py-2 text-muted">Aucun compte</li>}
          {resultats.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c.id === valeur}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choisir(c)}
              onMouseEnter={() => setActif(i)}
              className={`flex cursor-pointer gap-3 px-3 py-1.5 ${i === actif ? "bg-primary-soft" : ""}`}
            >
              <span className="w-14 shrink-0 font-mono text-xs leading-5 text-muted">{c.numero}</span>
              <span className="truncate">{c.libelle}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Montant({ valeur, className = "" }: { valeur: number; className?: string }) {
  return <span className={`montant whitespace-nowrap ${className}`}>{valeur ? formaterXOF(valeur, { symbole: false }) : ""}</span>;
}
