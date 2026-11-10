import type { SVGProps } from "react";

/** Icônes au trait (24 × 24), dessinées pour FacturAll. Couleur : currentColor. */

const TRACES = {
  accueil: (
    <>
      <rect x="3" y="3" width="7.5" height="9" rx="1.8" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.8" />
      <rect x="13.5" y="11" width="7.5" height="10" rx="1.8" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.8" />
    </>
  ),
  ventes: (
    <>
      <path d="M5.5 3h13v18l-2.6-1.6L13.3 21l-2.6-1.6L8.1 21l-2.6-1.6z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </>
  ),
  achats: (
    <>
      <path d="M5.5 7.5h13l-1.1 12.1a1.6 1.6 0 0 1-1.6 1.4H8.2a1.6 1.6 0 0 1-1.6-1.4z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  stock: (
    <>
      <path d="M12 3 3.5 7.5 12 12l8.5-4.5z" />
      <path d="M3.5 7.5v9L12 21l8.5-4.5v-9M12 12v9" />
    </>
  ),
  comptabilite: (
    <>
      <path d="M3 21h18" />
      <path d="M6 17v-5M10.5 17V7M15 17v-7.5M19.5 17V4.5" />
    </>
  ),
  banque: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5M3 21h18" />
    </>
  ),
  boutiques: (
    <>
      <path d="M4 9.5 5.6 4h12.8L20 9.5" />
      <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
      <path d="M5 11.5V21h14v-9.5M10 21v-5h4v5" />
    </>
  ),
  membres: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20.5a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.4 6.4 0 0 1 3.5 6.3" />
    </>
  ),
  entreprise: (
    <>
      <path d="M4.5 21V4.5A1.5 1.5 0 0 1 6 3h7a1.5 1.5 0 0 1 1.5 1.5V21M14.5 9H18a1.5 1.5 0 0 1 1.5 1.5V21M2.5 21h19" />
      <path d="M8 7.5h3M8 11.5h3M8 15.5h3" />
    </>
  ),
  deconnexion: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="m9.5 8-4 4 4 4M5.5 12H15" />
    </>
  ),
  soleil: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  lune: <path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z" />,
  ecran: (
    <>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  fermer: <path d="M6 6l12 12M18 6 6 18" />,
  hausse: <path d="M7 17 17 7M9 7h8v8" />,
  baisse: <path d="M7 7l10 10M17 9v8H9" />,
  plus: <path d="M12 5v14M5 12h14" />,
  fleche: <path d="M5 12h14M13 6l6 6-6 6" />,
  alerte: (
    <>
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  caisse: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18M7 15h3" />
    </>
  ),
} as const;

export type NomIcone = keyof typeof TRACES;

export function Icone({ nom, taille = 20, ...props }: SVGProps<SVGSVGElement> & { nom: NomIcone; taille?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={taille}
      height={taille}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {TRACES[nom]}
    </svg>
  );
}
