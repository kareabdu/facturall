"use client";

import { LIBELLES_ROLES, peutLireAchats, peutLireCompta, peutLireStock, type Role } from "@facturall/core";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Liste, Logo } from "@/components/ui";
import { oublierEspace, useEspace } from "@/lib/espace";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

interface Lien {
  href: string;
  libelle: string;
  bientot?: boolean;
  /** Affiché seulement si la condition est vraie pour le rôle */
  visible?: (role: Role | null) => boolean;
}

const LIENS: Lien[] = [
  { href: "/tableau-de-bord", libelle: "Tableau de bord" },
  { href: "/ventes", libelle: "Ventes" },
  { href: "/achats", libelle: "Achats", visible: peutLireAchats },
  { href: "/stock", libelle: "Stock", visible: peutLireStock },
  { href: "/comptabilite", libelle: "Comptabilité", visible: peutLireCompta },
  { href: "#banque", libelle: "Banque", bientot: true },
  { href: "/boutiques", libelle: "Boutiques" },
  { href: "/membres", libelle: "Membres" },
  { href: "/entreprise", libelle: "Entreprise" },
];

export function BarreLaterale() {
  const { session } = useSession();
  const { entreprises, entreprise, boutiques, boutique, role, choisirEntreprise, choisirBoutique } = useEspace();
  const pathname = usePathname();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);

  async function deconnexion() {
    oublierEspace();
    await supabase.auth.signOut();
    router.replace("/connexion");
  }

  const boutiquesActives = boutiques.filter((b) => b.active);

  return (
    <aside className="print:hidden border-b border-border bg-surface md:sticky md:top-0 md:flex md:h-screen md:w-64 md:flex-col md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-4 py-4">
        <Logo />
        <button
          className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-background md:hidden"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
        >
          {ouvert ? "Fermer" : "Menu"}
        </button>
      </div>

      <div className={`${ouvert ? "flex" : "hidden"} flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4 md:flex`}>
        <div className="flex flex-col gap-2 rounded-xl bg-background p-3">
          <Liste
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
          </Liste>
          <Liste
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
          </Liste>
          {role && <p className="px-1 text-xs text-muted">Votre rôle : {LIBELLES_ROLES[role]}</p>}
        </div>

        <nav className="flex flex-col gap-0.5">
          {LIENS.filter((l) => !l.visible || l.visible(role)).map((l) =>
            l.bientot ? (
              <span
                key={l.href}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted/70"
                title="Disponible dans une prochaine étape"
              >
                {l.libelle}
                <span className="text-[10px] uppercase tracking-wide">bientôt</span>
              </span>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOuvert(false)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === l.href || pathname.startsWith(l.href + "/") ? "bg-primary-soft text-primary" : "text-foreground hover:bg-background"
                }`}
              >
                {l.libelle}
              </Link>
            ),
          )}
        </nav>

        <div className="mt-auto border-t border-border pt-3">
          <p className="truncate px-3 text-xs text-muted" title={session?.user.email}>
            {session?.user.email}
          </p>
          <button
            onClick={() => void deconnexion()}
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-background hover:text-foreground"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </aside>
  );
}
