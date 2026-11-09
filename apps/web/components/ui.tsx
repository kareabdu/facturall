import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/** Petits composants d'interface communs (Tailwind). */

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-white">F</span>
      <span className="text-lg">
        Factur<span className="text-primary">All</span>
      </span>
    </span>
  );
}

type Variante = "primaire" | "secondaire" | "danger" | "discret";

const variantes: Record<Variante, string> = {
  primaire: "bg-primary text-white hover:bg-primary-hover",
  secondaire: "border border-border bg-surface text-foreground hover:bg-background",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-soft",
  discret: "text-muted hover:text-foreground hover:bg-background",
};

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
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variantes[variante]} ${className}`}
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
  return (
    <Link
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${variantes[variante]} ${className}`}
    />
  );
}

const styleChamp =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-background";

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
    <section className={`rounded-xl border border-border bg-surface ${className}`}>
      {(titre || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
          <h2 className="font-semibold">{titre}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Alerte({ type = "erreur", children }: { type?: "erreur" | "succes" | "info"; children: ReactNode }) {
  const styles = {
    erreur: "border-danger/20 bg-danger-soft text-danger",
    succes: "border-primary/20 bg-primary-soft text-primary",
    info: "border-border bg-background text-muted",
  };
  return (
    <div role={type === "erreur" ? "alert" : "status"} className={`rounded-lg border px-3.5 py-2.5 text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}

export function Badge({ children, ton = "neutre" }: { children: ReactNode; ton?: "neutre" | "vert" | "gris" }) {
  const tons = {
    neutre: "bg-background text-foreground border-border",
    vert: "bg-primary-soft text-primary border-primary/20",
    gris: "bg-background text-muted border-border",
  };
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${tons[ton]}`}>{children}</span>;
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
        <h1 className="text-2xl font-semibold tracking-tight">{titre}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
