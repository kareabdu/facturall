import Link from "next/link";
import { useId, type ButtonHTMLAttributes, type ComponentProps, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

import { Icone } from "@/components/icones";

/** Composants d'interface communs — direction « fintech moderne » (couleurs : globals.css). */

/** Monogramme : un « F » fait de barres de grand livre, et une pièce. */
export function Monogramme({ taille = 32, className = "" }: { taille?: number; className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" width={taille} height={taille} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#20C997" />
          <stop offset="1" stopColor="#087F5B" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <rect x="9" y="7.5" width="3.4" height="17" rx="1.7" fill="#fff" />
      <rect x="9" y="7.5" width="14" height="3.4" rx="1.7" fill="#fff" />
      <rect x="9" y="14.3" width="9" height="3.4" rx="1.7" fill="#fff" fillOpacity="0.85" />
      <circle cx="21.6" cy="21.8" r="2.6" fill="#D3F9E8" />
    </svg>
  );
}

export function Logo({ className = "", inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <Monogramme />
      <span className={`text-lg ${inverse ? "text-panneau-texte" : "text-foreground"}`}>
        Factur<span className={inverse ? "text-accent" : "text-primary"}>All</span>
      </span>
    </span>
  );
}

type Variante = "primaire" | "secondaire" | "danger" | "discret";

const variantes: Record<Variante, string> = {
  primaire: "bg-primary text-on-primary shadow-sm hover:bg-primary-hover",
  secondaire: "border border-border bg-surface text-foreground hover:bg-surface-retrait",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-soft",
  discret: "text-muted hover:bg-surface-retrait hover:text-foreground",
};

const baseBouton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function Bouton({
  variante = "primaire",
  chargement = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; chargement?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || chargement}
      className={`${baseBouton} disabled:cursor-not-allowed disabled:opacity-55 ${variantes[variante]} ${className}`}
    >
      {chargement && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

/** Lien présenté comme un bouton (navigation). */
export function LienBouton({
  variante = "primaire",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link {...props} className={`${baseBouton} ${variantes[variante]} ${className}`} />;
}

const styleChamp =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:bg-surface-retrait disabled:text-muted";

export function Champ({
  libelle,
  aide,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { libelle: string; aide?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium">
        {libelle}
        {props.required && <span className="text-danger"> *</span>}
      </span>
      <input {...props} className={styleChamp} />
      {aide && <span className="text-xs text-muted">{aide}</span>}
    </label>
  );
}

export function Liste({
  libelle,
  children,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { libelle?: string }) {
  // Sans libellé, la largeur peut être imposée par className (ex. « w-auto »)
  const largeur = !libelle && /(^|\s)(min-)?w-/.test(className) ? "" : "w-full";
  const select = (
    <select {...props} className={`${styleChamp.replace("w-full", largeur)} pr-8 ${libelle ? "" : className}`}>
      {children}
    </select>
  );
  if (!libelle) return select;
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium">
        {libelle}
        {props.required && <span className="text-danger"> *</span>}
      </span>
      {select}
    </label>
  );
}

export function Carte({ titre, action, children, className = "" }: {
  titre?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-carte ${className}`}>
      {(titre || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <h2 className="font-semibold tracking-tight">{titre}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Alerte({ type = "erreur", children }: { type?: "erreur" | "succes" | "info" | "attention"; children: ReactNode }) {
  const styles = {
    erreur: "border-danger/25 bg-danger-soft text-danger",
    succes: "border-primary/25 bg-primary-soft text-primary",
    info: "border-border bg-surface-retrait text-muted",
    attention: "border-warning/30 bg-warning-soft text-warning",
  };
  return (
    <div role={type === "erreur" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}

export type TonBadge = "neutre" | "vert" | "gris" | "rouge" | "orange";

const tonsBadge: Record<TonBadge, string> = {
  neutre: "bg-surface-retrait text-foreground ring-border",
  vert: "bg-primary-soft text-primary ring-primary/20",
  gris: "bg-surface-retrait text-muted ring-border",
  rouge: "bg-danger-soft text-danger ring-danger/20",
  orange: "bg-warning-soft text-warning ring-warning/25",
};

export function Badge({ children, ton = "neutre" }: { children: ReactNode; ton?: TonBadge }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tonsBadge[ton]}`}>
      {children}
    </span>
  );
}

export function Chargement({ texte = "Chargement…" }: { texte?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-3 p-10 text-sm text-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {texte}
    </div>
  );
}

export function EnTetePage({ titre, description, action }: { titre: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{titre}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Tuile d'indicateur (KPI). */
export function Indicateur({
  libelle,
  valeur,
  detail,
  ton = "neutre",
  href,
}: {
  libelle: string;
  valeur: ReactNode;
  detail?: ReactNode;
  ton?: "neutre" | "danger" | "attention" | "succes";
  href?: string;
}) {
  const couleur = { neutre: "", danger: "text-danger", attention: "text-warning", succes: "text-primary" }[ton];
  const contenu = (
    <>
      <p className="text-sm text-muted">{libelle}</p>
      <p className={`chiffre montant mt-1.5 text-xl font-semibold sm:text-2xl ${couleur}`}>{valeur}</p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
    </>
  );
  const classe = "rounded-2xl border border-border bg-surface p-4 shadow-carte sm:p-5";
  return href ? (
    <Link href={href} className={`${classe} transition-colors hover:border-primary/40`}>
      {contenu}
    </Link>
  ) : (
    <div className={classe}>{contenu}</div>
  );
}

/** Onglets de navigation d'un module (sous le titre). */
export function Onglets({ onglets, actif }: { onglets: { href: string; libelle: string }[]; actif: (href: string) => boolean }) {
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1 pb-1">
      {onglets.map((o) => {
        const a = actif(o.href);
        return (
          <Link
            key={o.href}
            href={o.href}
            aria-current={a ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              a ? "bg-foreground text-background" : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {o.libelle}
          </Link>
        );
      })}
    </nav>
  );
}

/** Choix exclusif compact (ex. Factures / Devis / Avoirs). */
export function Segments<T extends string>({
  options,
  valeur,
  onChange,
  libelle,
  surPanneau = false,
}: {
  options: { valeur: T; libelle: ReactNode }[];
  valeur: T;
  onChange: (v: T) => void;
  libelle?: string;
  /** Posé sur un bandeau sombre (bg-panneau) */
  surPanneau?: boolean;
}) {
  const conteneur = surPanneau ? "border-panneau-bordure bg-white/5" : "border-border bg-surface-retrait";
  const choisi = surPanneau ? "bg-white/10 text-white" : "bg-surface text-foreground shadow-sm ring-1 ring-border";
  const autre = surPanneau ? "text-panneau-discret hover:text-panneau-texte" : "text-muted hover:text-foreground";
  return (
    <div role="radiogroup" aria-label={libelle} className={`inline-flex gap-1 rounded-xl border p-1 ${conteneur}`}>
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          role="radio"
          aria-checked={valeur === o.valeur}
          onClick={() => onChange(o.valeur)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors ${
            valeur === o.valeur ? choisi : autre
          }`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

/** Variation en % avec flèche (vert en hausse, rouge en baisse). */
export function Variation({ valeur, inverse = false }: { valeur: number | null; inverse?: boolean }) {
  if (valeur === null) return null;
  const hausse = valeur >= 0;
  const bon = inverse ? !hausse : hausse;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
        bon ? "bg-primary-soft text-primary" : "bg-danger-soft text-danger"
      }`}
    >
      <Icone nom={hausse ? "hausse" : "baisse"} taille={13} strokeWidth={2.25} />
      {hausse ? "+" : "−"}
      {Math.abs(valeur)} %
    </span>
  );
}
