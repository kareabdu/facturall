"use client";

import { formaterDate, formaterXOF, formaterXOFCourt, type PointSerie } from "@facturall/core";
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

/**
 * Courbe des ventes (une série) pour le bandeau sombre du tableau de bord :
 * trait 2 px, aire à 10 %, grille en filets, réticule + infobulle au survol et au clavier,
 * tableau équivalent pour les lecteurs d'écran.
 */

const L = 600;
const H = 160;
const MARGE_HAUT = 12;
const MARGE_BAS = 4;
const COULEUR = "#20C997"; // contraste ≥ 3:1 sur le panneau sombre (vérifié)

/** Graduations 0, pas, 2 × pas avec un pas « rond » (1, 2, 2,5 ou 5 × 10ⁿ) tel que 2 × pas ≥ max. */
function graduations(max: number): number[] {
  if (max <= 0) return [0];
  const cible = max / 2;
  const puissance = Math.pow(10, Math.floor(Math.log10(cible)));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((u) => u >= cible) ?? puissance * 10;
  return [0, pas, pas * 2];
}

export function GraphiqueVentes({ serie }: { serie: PointSerie[] }) {
  const id = useId();
  const [survol, setSurvol] = useState<number | null>(null);

  const { chemin, aire, points, echelle, max } = useMemo(() => {
    const maxBrut = Math.max(0, ...serie.map((p) => p.montant));
    const g = graduations(maxBrut);
    const max = Math.max(g[g.length - 1], 1);
    const min = Math.min(0, ...serie.map((p) => p.montant));
    const y = (v: number) => MARGE_HAUT + (1 - (v - min) / (max - min)) * (H - MARGE_HAUT - MARGE_BAS);
    const x = (i: number) => (serie.length <= 1 ? L / 2 : (i / (serie.length - 1)) * L);
    const points = serie.map((p, i) => ({ x: x(i), y: y(p.montant) }));
    const chemin = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
    const aire = `${chemin}L${L},${y(0).toFixed(1)}L0,${y(0).toFixed(1)}Z`;
    return { chemin, aire, points, echelle: g.map((v) => ({ v, y: y(v) })), max };
  }, [serie]);

  if (serie.length === 0) return null;

  function depuisPointeur(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setSurvol(Math.round(ratio * (serie.length - 1)));
  }

  function clavier(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") setSurvol((s) => Math.max(0, (s ?? serie.length) - 1));
    else if (e.key === "ArrowRight") setSurvol((s) => Math.min(serie.length - 1, (s ?? -1) + 1));
    else if (e.key === "Escape") setSurvol(null);
    else return;
    e.preventDefault();
  }

  const p = survol !== null ? serie[survol] : null;
  const pt = survol !== null ? points[survol] : null;
  const milieu = Math.floor((serie.length - 1) / 2);

  return (
    <figure className="relative">
      <div
        className="relative h-40 cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg"
        tabIndex={0}
        role="img"
        aria-label={`Courbe des ventes du ${formaterDate(serie[0].date)} au ${formaterDate(serie[serie.length - 1].date)}. Flèches gauche et droite pour lire chaque jour.`}
        aria-describedby={`${id}-table`}
        onPointerMove={depuisPointeur}
        onPointerLeave={() => setSurvol(null)}
        onKeyDown={clavier}
        onBlur={() => setSurvol(null)}
      >
        <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          {echelle.map((g) => (
            <line key={g.v} x1={0} x2={L} y1={g.y} y2={g.y} stroke="rgb(255 255 255 / 0.08)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={aire} fill={COULEUR} fillOpacity={0.1} />
          <path d={chemin} fill="none" stroke={COULEUR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {pt && (
            <line x1={pt.x} x2={pt.x} y1={0} y2={H} stroke="rgb(255 255 255 / 0.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* Marqueur rond hors SVG pour ne pas être déformé par preserveAspectRatio */}
        {pt && (
          <span
            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panneau"
            style={{ left: `${(pt.x / L) * 100}%`, top: `${(pt.y / H) * 100}%`, background: COULEUR }}
          />
        )}
        {/* Graduations, à droite, en texte discret */}
        {echelle.slice(1).map((g) => (
          <span
            key={g.v}
            className="montant pointer-events-none absolute right-0 -translate-y-full pb-0.5 text-[11px] text-panneau-discret"
            style={{ top: `${(g.y / H) * 100}%` }}
          >
            {formaterXOFCourt(g.v)}
          </span>
        ))}
        {p && pt && (
          <div
            className="pointer-events-none absolute z-10 rounded-xl bg-white px-3 py-2 text-left shadow-menu"
            style={{
              left: `${(pt.x / L) * 100}%`,
              top: `${(pt.y / H) * 100}%`,
              transform: `translate(${pt.x / L > 0.7 ? "-100%" : pt.x / L < 0.3 ? "0" : "-50%"}, calc(-100% - 12px))`,
            }}
          >
            <p className="montant whitespace-nowrap text-sm font-semibold text-[#0E1A16]">{formaterXOF(p.montant)}</p>
            <p className="whitespace-nowrap text-xs text-[#5B6B65]">{formaterDate(p.date)}</p>
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex justify-between text-[11px] text-panneau-discret">
        <span>{formaterDate(serie[0].date)}</span>
        <span>{formaterDate(serie[milieu].date)}</span>
        <span>{formaterDate(serie[serie.length - 1].date)}</span>
      </figcaption>

      <table id={`${id}-table`} className="sr-only">
        <caption>Ventes nettes TTC par jour (max {formaterXOF(max)})</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Ventes</th>
          </tr>
        </thead>
        <tbody>
          {serie.map((s) => (
            <tr key={s.date}>
              <td>{formaterDate(s.date)}</td>
              <td>{formaterXOF(s.montant)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
