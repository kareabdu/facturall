"use client";

import {
  ajusterStock,
  aujourdhui,
  chargerStocks,
  formaterQuantite,
  formaterXOF,
  lireQuantite,
  modifierParametresStock,
  niveauStock,
  type LigneStock,
  type NiveauStock,
} from "@facturall/core";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { ChampMontant, Montant } from "@/components/compta";
import { BadgeNiveau, ChoixArticleStock } from "@/components/stock";
import { Alerte, Bouton, Carte, Champ, Chargement, Indicateur, Liste } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { useStock } from "@/lib/stock";
import { supabase } from "@/lib/supabase";

const TOUTES = "__toutes";

interface Ligne {
  articleId: string;
  designation: string;
  reference: string | null;
  unite: string;
  seuil: number | null;
  quantite: number;
  valeur: number;
  cmup: number;
  /** Détail par boutique (vue « toutes les boutiques ») */
  detail: { boutiqueId: string; quantite: number }[];
}

export default function PageStock() {
  const { entreprise, boutique, role } = useEspace();
  const { articles, boutiques, boutiqueParId, peutGerer, parametres, rafraichir } = useStock();
  const [choix, setChoix] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [niveau, setNiveau] = useState<NiveauStock | "">("");
  const [version, setVersion] = useState(0);
  const [resultat, setResultat] = useState<{ cle: string; stocks: LigneStock[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ajustement, setAjustement] = useState(false);

  const boutiqueId = choix ?? boutique?.id ?? TOUTES;
  const toutes = boutiqueId === TOUTES;
  const eid = entreprise?.entreprise_id;
  const cle = `${eid}|${boutiqueId}|${version}`;

  useEffect(() => {
    if (!eid) return;
    let actif = true;
    chargerStocks(supabase, eid, toutes ? undefined : boutiqueId)
      .then((stocks) => actif && setResultat({ cle, stocks }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [eid, boutiqueId, toutes, cle]);

  const stocks = resultat?.cle === cle ? resultat.stocks : null;

  const lignes = useMemo<Ligne[] | null>(() => {
    if (!stocks) return null;
    const parArticle = new Map<string, Ligne>();
    for (const a of articles) {
      if (!a.actif) continue;
      parArticle.set(a.id, {
        articleId: a.id,
        designation: a.designation,
        reference: a.reference,
        unite: a.unite,
        seuil: a.seuil_alerte,
        quantite: 0,
        valeur: 0,
        cmup: 0,
        detail: [],
      });
    }
    for (const s of stocks) {
      const l = parArticle.get(s.article_id);
      if (!l) {
        // Article désactivé mais encore en stock : on l'affiche
        if (s.quantite === 0) continue;
        parArticle.set(s.article_id, {
          articleId: s.article_id,
          designation: s.articles?.designation ?? "—",
          reference: s.articles?.reference ?? null,
          unite: s.articles?.unite ?? "",
          seuil: s.articles?.seuil_alerte ?? null,
          quantite: s.quantite,
          valeur: s.valeur,
          cmup: s.cmup,
          detail: [{ boutiqueId: s.boutique_id, quantite: s.quantite }],
        });
        continue;
      }
      l.quantite = Math.round((l.quantite + s.quantite) * 1000) / 1000;
      l.valeur += s.valeur;
      l.cmup = toutes ? (l.quantite > 0 ? Math.round(l.valeur / l.quantite) : s.cmup) : s.cmup;
      if (s.quantite !== 0) l.detail.push({ boutiqueId: s.boutique_id, quantite: s.quantite });
    }
    return [...parArticle.values()].sort((a, b) => a.designation.localeCompare(b.designation, "fr"));
  }, [stocks, articles, toutes]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (lignes ?? []).filter(
      (l) =>
        (!q || l.designation.toLowerCase().includes(q) || (l.reference ?? "").toLowerCase().includes(q)) &&
        (!niveau || niveauStock(l.quantite, l.seuil) === niveau),
    );
  }, [lignes, recherche, niveau]);

  const indicateurs = useMemo(() => {
    if (!lignes) return null;
    return {
      valeur: lignes.reduce((s, l) => s + l.valeur, 0),
      articles: lignes.length,
      bas: lignes.filter((l) => niveauStock(l.quantite, l.seuil) === "bas").length,
      rupture: lignes.filter((l) => niveauStock(l.quantite, l.seuil) === "rupture").length,
    };
  }, [lignes]);

  if (!entreprise || !eid) return null;
  const admin = role === "proprietaire" || role === "admin";

  if (articles.length === 0) {
    return (
      <Carte>
        <p className="py-6 text-center text-sm text-muted">
          Aucun article n&apos;est suivi en stock.{" "}
          <Link href="/ventes/articles" className="text-primary hover:underline">
            Cochez « Suivre le stock » sur vos articles
          </Link>{" "}
          pour enregistrer leurs entrées et sorties.
        </p>
      </Carte>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Liste aria-label="Boutique" className="w-auto min-w-48" value={boutiqueId} onChange={(e) => setChoix(e.target.value)}>
          <option value={TOUTES}>Toutes les boutiques</option>
          {boutiques.map((b) => (
            <option key={b.id} value={b.id}>{b.nom}</option>
          ))}
        </Liste>
        <input
          aria-label="Rechercher un article"
          placeholder="Désignation ou référence…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="h-10 min-w-48 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary sm:max-w-72"
        />
        <Liste aria-label="Niveau" className="w-auto" value={niveau} onChange={(e) => setNiveau(e.target.value as NiveauStock | "")}>
          <option value="">Tous les niveaux</option>
          <option value="bas">Stock bas</option>
          <option value="rupture">Rupture</option>
        </Liste>
        {peutGerer && !toutes && (
          <Bouton className="ml-auto" onClick={() => setAjustement(true)}>Entrée / sortie manuelle</Bouton>
        )}
      </div>

      {indicateurs && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Valeur du stock", formaterXOF(indicateurs.valeur), ""],
            ["Articles suivis", String(indicateurs.articles), ""],
            ["Stock bas", String(indicateurs.bas), indicateurs.bas > 0 ? "text-warning" : ""],
            ["En rupture", String(indicateurs.rupture), indicateurs.rupture > 0 ? "text-danger" : ""],
          ].map(([libelle, valeur, classe]) => (
            <Indicateur
              key={libelle}
              libelle={libelle}
              valeur={valeur}
              ton={classe.includes("danger") ? "danger" : classe.includes("warning") ? "attention" : "neutre"}
            />
          ))}
        </div>
      )}

      {erreur && <Alerte>{erreur}</Alerte>}
      {message && <Alerte type="succes">{message}</Alerte>}

      {ajustement && !toutes && (
        <FormulaireAjustement
          boutiqueNom={boutiqueParId.get(boutiqueId)?.nom ?? ""}
          stocks={lignes ?? []}
          onAnnuler={() => setAjustement(false)}
          onEnregistrer={async (a) => {
            setErreur(null);
            setMessage(null);
            try {
              await ajusterStock(supabase, { entrepriseId: eid, boutiqueId, ...a });
              setAjustement(false);
              setVersion((v) => v + 1);
              setMessage(a.quantite > 0 ? "Entrée enregistrée." : "Sortie enregistrée.");
            } catch (e) {
              setErreur((e as Error).message);
            }
          }}
        />
      )}

      <Carte>
        {!lignes ? (
          <Chargement />
        ) : filtrees.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Aucun article ne correspond.</p>
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-border bg-surface-retrait text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Article</th>
                  <th className="px-2 py-2.5 font-medium">Niveau</th>
                  <th className="px-2 py-2.5 text-right font-medium">Quantité</th>
                  <th className="px-2 py-2.5 text-right font-medium">CMUP</th>
                  <th className="px-5 py-2.5 text-right font-medium">Valeur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrees.map((l) => (
                  <tr key={l.articleId} className="hover:bg-surface-retrait">
                    <td className="px-5 py-3">
                      <Link
                        href={`/stock/mouvements?article=${l.articleId}${toutes ? "" : `&boutique=${boutiqueId}`}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {l.designation}
                      </Link>
                      {l.reference && <span className="ml-2 font-mono text-xs text-muted">{l.reference}</span>}
                      {toutes && l.detail.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted">
                          {l.detail
                            .map((d) => `${boutiqueParId.get(d.boutiqueId)?.nom ?? "?"} : ${formaterQuantite(d.quantite)}`)
                            .join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-3"><BadgeNiveau quantite={l.quantite} seuil={l.seuil} /></td>
                    <td className={`montant px-2 py-3 text-right font-medium ${l.quantite < 0 ? "text-danger" : ""}`}>
                      {formaterQuantite(l.quantite)} <span className="text-xs font-normal text-muted">{l.unite}</span>
                    </td>
                    <td className="px-2 py-3 text-right"><Montant valeur={l.cmup} /></td>
                    <td className="px-5 py-3 text-right font-medium"><Montant valeur={l.valeur} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      {admin && parametres && (
        <Carte titre="Paramètres du stock">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary"
              checked={parametres.autoriser_stock_negatif}
              onChange={async (e) => {
                setErreur(null);
                try {
                  await modifierParametresStock(supabase, eid, e.target.checked);
                  await rafraichir();
                } catch (err) {
                  setErreur((err as Error).message);
                }
              }}
            />
            <span>
              <span className="font-medium">Autoriser le stock négatif</span>
              <span className="block text-muted">
                Permet de valider une vente même si le stock enregistré est insuffisant (marchandise reçue mais pas
                encore saisie). Sinon, la validation est refusée.
              </span>
            </span>
          </label>
        </Carte>
      )}
    </div>
  );
}

function FormulaireAjustement({
  boutiqueNom,
  stocks,
  onAnnuler,
  onEnregistrer,
}: {
  boutiqueNom: string;
  stocks: Ligne[];
  onAnnuler: () => void;
  onEnregistrer: (a: { articleId: string; quantite: number; motif: string; coutUnitaire: number | null; date: string }) => Promise<void>;
}) {
  const { articles } = useStock();
  const [articleId, setArticleId] = useState("");
  const [sens, setSens] = useState<"entree" | "sortie">("entree");
  const [quantite, setQuantite] = useState("");
  const [cout, setCout] = useState(0);
  const [motif, setMotif] = useState("");
  const [date, setDate] = useState(aujourdhui());
  const [envoi, setEnvoi] = useState(false);

  const disponibilites = useMemo(() => new Map(stocks.map((s) => [s.articleId, s.quantite])), [stocks]);
  const ligne = stocks.find((s) => s.articleId === articleId);
  const q = lireQuantite(quantite);
  const valide = !!articleId && q !== null && q > 0 && motif.trim().length > 0;

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!valide || q === null) return;
    setEnvoi(true);
    await onEnregistrer({
      articleId,
      quantite: sens === "entree" ? q : -q,
      motif: motif.trim(),
      coutUnitaire: sens === "entree" && cout > 0 ? cout : null,
      date,
    });
    setEnvoi(false);
  }

  return (
    <Carte titre={`Entrée ou sortie manuelle — ${boutiqueNom}`}>
      <form onSubmit={soumettre} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6" noValidate>
        <div className="sm:col-span-2 lg:col-span-3">
          <ChoixArticleStock libelle="Article" articles={articles} valeur={articleId} onChange={setArticleId} disponibilites={disponibilites} />
        </div>
        <Liste libelle="Mouvement" value={sens} onChange={(e) => setSens(e.target.value as "entree" | "sortie")}>
          <option value="entree">Entrée</option>
          <option value="sortie">Sortie</option>
        </Liste>
        <Champ libelle="Quantité" inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} placeholder="0" required />
        <Champ libelle="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {sens === "entree" ? (
          <div className="sm:col-span-2">
            <ChampMontant libelle="Coût unitaire HT (FCFA)" valeur={cout} onChange={setCout} placeholder={ligne?.cmup ? String(ligne.cmup) : "0"} />
            <p className="mt-1 text-xs text-muted">
              Vide : entrée au CMUP actuel{ligne?.cmup ? ` (${formaterXOF(ligne.cmup)})` : ""}. Pour un stock initial, indiquez le coût d&apos;achat.
            </p>
          </div>
        ) : (
          <p className="self-end pb-2 text-xs text-muted sm:col-span-2">
            Sortie valorisée au CMUP{ligne?.cmup ? ` (${formaterXOF(ligne.cmup)})` : ""}.
            {ligne && ` Disponible : ${formaterQuantite(ligne.quantite)} ${ligne.unite}.`}
          </p>
        )}
        <Champ
          libelle="Motif"
          className="sm:col-span-2 lg:col-span-4"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder={sens === "entree" ? "Stock initial, don reçu…" : "Casse, perte, consommation interne…"}
          required
        />
        <div className="flex justify-end gap-3 sm:col-span-2 lg:col-span-6">
          <Bouton type="button" variante="secondaire" onClick={onAnnuler}>Annuler</Bouton>
          <Bouton type="submit" chargement={envoi} disabled={!valide}>Enregistrer</Bouton>
        </div>
      </form>
    </Carte>
  );
}
