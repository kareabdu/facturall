"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Icone, type NomIcone } from "@/components/icones";
import { Chargement, Logo } from "@/components/ui";
import { useSession } from "@/lib/session";

const ATOUTS: { icone: NomIcone; titre: string; texte: string }[] = [
  { icone: "ventes", titre: "Factures et encaissements", texte: "Devis, factures, avoirs, Mobile Money et caisse." },
  { icone: "stock", titre: "Stock par boutique", texte: "Achats, ventes, transferts et inventaires au CMUP." },
  { icone: "comptabilite", titre: "Comptabilité SYSCOHADA", texte: "Écritures passées automatiquement, en FCFA." },
];

/** Pages accessibles sans connexion (connexion, inscription, mot de passe oublié). */
export default function LayoutPublic({ children }: LayoutProps<"/">) {
  const { session, chargement, recuperation } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (chargement) return;
    if (recuperation) router.replace("/nouveau-mot-de-passe");
    else if (session) router.replace("/tableau-de-bord");
  }, [chargement, session, recuperation, router]);

  if (chargement || session) return <Chargement />;

  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-panneau p-10 text-panneau-texte lg:flex lg:flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-1/3 size-96 rounded-full bg-accent/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 right-0 size-96 rounded-full bg-primary/30 blur-3xl" />
        <Logo inverse className="relative" />
        <div className="relative my-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Votre commerce et votre comptabilité, au même endroit.
          </h2>
          <ul className="mt-8 flex flex-col gap-5">
            {ATOUTS.map((a) => (
              <li key={a.titre} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-accent ring-1 ring-panneau-bordure">
                  <Icone nom={a.icone} />
                </span>
                <span>
                  <span className="block font-medium text-white">{a.titre}</span>
                  <span className="block text-sm text-panneau-discret">{a.texte}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-panneau-discret">Conçu pour l&apos;UEMOA · Franc CFA (XOF)</p>
      </aside>

      <div className="flex flex-col items-center justify-center px-4 py-10 sm:py-16">
        <Logo className="mb-8 lg:hidden" />
        <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-carte sm:p-8">{children}</div>
        <p className="mt-8 text-center text-xs text-muted lg:hidden">Gestion commerciale et comptabilité SYSCOHADA · FCFA</p>
      </div>
    </div>
  );
}
