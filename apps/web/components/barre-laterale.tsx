"use client";

import {
  LIBELLES_ROLES,
  LIBELLES_THEMES,
  peutLireAchats,
  peutLireCompta,
  peutLireStock,
  type PreferenceTheme,
  type Role,
} from "@facturall/core";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode, type SelectHTMLAttributes } from "react";

import { Icone, type NomIcone } from "@/components/icones";
import { Logo } from "@/components/ui";
import { oublierEspace, useEspace } from "@/lib/espace";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { changerTheme, usePreferenceTheme } from "@/lib/theme";

interface Lien {
  href: string;
  libelle: string;
  icone: NomIcone;
  bientot?: boolean;
  /** Affiché seulement si la condition est vraie pour le rôle */
  visible?: (role: Role | null) => boolean;
}

const GROUPES: { titre?: string; liens: Lien[] }[] = [
  {
    liens: [
      { href: "/tableau-de-bord", libelle: "Tableau de bord", icone: "accueil" },
      { href: "/ventes", libelle: "Ventes", icone: "ventes" },
      { href: "/achats", libelle: "Achats", icone: "achats", visible: peutLireAchats },
      { href: "/stock", libelle: "Stock", icone: "stock", visible: peutLireStock },
      { href: "/comptabilite", libelle: "Comptabilité", icone: "comptabilite", visible: peutLireCompta },
      { href: "/comptabilite/rapprochement", libelle: "Banque", icone: "banque", visible: peutLireCompta },
    ],
  },
  {
    titre: "Organisation",
    liens: [
      { href: "/boutiques", libelle: "Boutiques", icone: "boutiques" },
      { href: "/membres", libelle: "Membres", icone: "membres" },
      { href: "/entreprise", libelle: "Entreprise", icone: "entreprise" },
    ],
  },
];

const THEMES: { valeur: PreferenceTheme; icone: NomIcone }[] = [
  { valeur: "auto", icone: "ecran" },
  { valeur: "clair", icone: "soleil" },
  { valeur: "sombre", icone: "lune" },
];

function ListePanneau(props: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-xl border border-panneau-bordure bg-white/5 px-3 pr-8 text-sm text-panneau-texte outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20 disabled:opacity-60 [&>option]:bg-panneau"
    />
  );
}

export function BarreLaterale() {
  const { session } = useSession();
  const { entreprises, entreprise, boutiques, boutique, role, choisirEntreprise, choisirBoutique } = useEspace();
  const pathname = usePathname();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const theme = usePreferenceTheme();

  async function deconnexion() {
    oublierEspace();
    await supabase.auth.signOut();
    router.replace("/connexion");
  }

  const boutiquesActives = boutiques.filter((b) => b.active);
  const nom = (session?.user.user_metadata?.nom_complet as string | undefined) ?? session?.user.email ?? "";
  const initiales = nom
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join("");

  return (
    <aside className="sticky top-0 z-30 bg-panneau text-panneau-texte print:hidden md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
      <div className="flex items-center justify-between px-4 py-4 md:px-5 md:py-5">
        <Link href="/tableau-de-bord" onClick={() => setOuvert(false)}>
          <Logo inverse />
        </Link>
        <button
          className="grid size-10 place-items-center rounded-xl text-panneau-discret hover:bg-white/5 hover:text-panneau-texte md:hidden"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu"}
        >
          <Icone nom={ouvert ? "fermer" : "menu"} />
        </button>
      </div>

      <div
        className={`${ouvert ? "flex" : "hidden"} max-h-[calc(100dvh-4.5rem)] flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4 md:flex md:max-h-none`}
      >
        <div className="flex flex-col gap-2 rounded-2xl border border-panneau-bordure bg-white/[0.03] p-3">
          <ListePanneau
            aria-label="Entreprise"
            value={entreprise?.entreprise_id ?? ""}
            onChange={(e) => {
              if (e.target.value === "__nouvelle") router.push("/nouvelle-entreprise");
              else choisirEntreprise(e.target.value);
            }}
          >
            {entreprises.map((e) => (
              <option key={e.entreprise_id} value={e.entreprise_id}>
                {e.sigle || e.raison_sociale}
              </option>
            ))}
            <option value="__nouvelle">+ Nouvelle entreprise…</option>
          </ListePanneau>
          <ListePanneau
            aria-label="Boutique"
            value={boutique?.id ?? ""}
            onChange={(e) => choisirBoutique(e.target.value)}
            disabled={boutiquesActives.length === 0}
          >
            {boutiquesActives.length === 0 && <option value="">Aucune boutique accessible</option>}
            {boutiquesActives.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nom}
              </option>
            ))}
          </ListePanneau>
        </div>

        {GROUPES.map((g, i) => (
          <nav key={i} className="flex flex-col gap-0.5" aria-label={g.titre ?? "Navigation principale"}>
            {g.titre && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-panneau-discret/80">{g.titre}</p>
            )}
            {g.liens
              .filter((l) => !l.visible || l.visible(role))
              .map((l) => {
                if (l.bientot) {
                  return (
                    <span
                      key={l.href}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-panneau-discret/60"
                      title="Disponible dans une prochaine étape"
                    >
                      <Icone nom={l.icone} />
                      {l.libelle}
                      <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide">bientôt</span>
                    </span>
                  );
                }
                // Lien le plus précis : « Banque » (/comptabilite/rapprochement) l'emporte sur « Comptabilité »
                const correspond = (h: string) => pathname === h || pathname.startsWith(h + "/");
                const actif =
                  correspond(l.href) &&
                  !GROUPES.some((x) => x.liens.some((m) => m.href.length > l.href.length && correspond(m.href)));
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOuvert(false)}
                    aria-current={actif ? "page" : undefined}
                    className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      actif ? "bg-accent/15 text-white" : "text-panneau-discret hover:bg-white/5 hover:text-panneau-texte"
                    }`}
                  >
                    {actif && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent" />}
                    <Icone nom={l.icone} className={actif ? "text-accent" : ""} />
                    {l.libelle}
                  </Link>
                );
              })}
          </nav>
        ))}

        <div className="mt-auto flex flex-col gap-3 border-t border-panneau-bordure pt-4">
          <div role="radiogroup" aria-label="Apparence" className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
            {THEMES.map((t) => (
              <button
                key={t.valeur}
                role="radio"
                aria-checked={theme === t.valeur}
                title={LIBELLES_THEMES[t.valeur]}
                onClick={() => changerTheme(t.valeur)}
                className={`flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors ${
                  theme === t.valeur ? "bg-white/10 text-white" : "text-panneau-discret hover:text-panneau-texte"
                }`}
              >
                <Icone nom={t.icone} taille={15} />
                <span className="hidden lg:inline">{t.valeur === "auto" ? "Auto" : LIBELLES_THEMES[t.valeur]}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 px-1">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
              {initiales || "?"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={session?.user.email}>
                {nom}
              </p>
              {role && <p className="truncate text-xs text-panneau-discret">{LIBELLES_ROLES[role]}</p>}
            </div>
            <button
              onClick={() => void deconnexion()}
              title="Se déconnecter"
              aria-label="Se déconnecter"
              className="grid size-9 place-items-center rounded-xl text-panneau-discret hover:bg-white/5 hover:text-panneau-texte"
            >
              <Icone nom="deconnexion" taille={18} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
