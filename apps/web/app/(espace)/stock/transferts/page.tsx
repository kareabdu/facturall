"use client";

import {
  aujourdhui,
  chargerStocks,
  chargerTransferts,
  formaterDate,
  formaterQuantite,
  lireQuantite,
  transfererStock,
  type TransfertStock,
} from "@facturall/core";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Montant } from "@/components/compta";
import { ChoixArticleStock } from "@/components/stock";
import { Alerte, Bouton, Carte, Champ, Chargement, Liste } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { useStock } from "@/lib/stock";
import { supabase } from "@/lib/supabase";

export default function PageTransferts() {
  const { entreprise } = useEspace();
  const { peutGerer, boutiques, boutiqueParId, articleParId } = useStock();
  const [version, setVersion] = useState(0);
  const [resultat, setResultat] = useState<{ cle: string; transferts: TransfertStock[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const eid = entreprise?.entreprise_id;
  const cle = `${eid}|${version}`;
  useEffect(() => {
    if (!eid) return;
    let actif = true;
    chargerTransferts(supabase, eid)
      .then((transferts) => actif && setResultat({ cle, transferts }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [eid, cle]);

  const transferts = resultat?.cle === cle ? resultat.transferts : null;
  if (!eid) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          Le transfert sort la marchandise de la boutique source au CMUP et l&apos;entre à la même valeur dans la boutique
          de destination.
        </p>
        {peutGerer && boutiques.length > 1 && !nouveau && (
          <Bouton className="ml-auto" onClick={() => setNouveau(true)}>Nouveau transfert</Bouton>
        )}
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}
      {message && <Alerte type="succes">{message}</Alerte>}
      {peutGerer && boutiques.length < 2 && (
        <Alerte type="info">Il faut au moins deux boutiques actives (auxquelles vous avez accès) pour transférer du stock.</Alerte>
      )}

      {nouveau && (
        <FormulaireTransfert
          onAnnuler={() => setNouveau(false)}
          onEnregistrer={async (t) => {
            setErreur(null);
            setMessage(null);
            try {
              await transfererStock(supabase, { entrepriseId: eid, ...t });
              setNouveau(false);
              setVersion((v) => v + 1);
              setMessage("Transfert enregistré.");
              return true;
            } catch (e) {
              setErreur((e as Error).message);
              return false;
            }
          }}
        />
      )}

      <Carte>
        {!transferts ? (
          <Chargement />
        ) : transferts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Aucun transfert.</p>
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">N°</th>
                  <th className="px-2 py-2.5 font-medium">Date</th>
                  <th className="px-2 py-2.5 font-medium">De</th>
                  <th className="px-2 py-2.5 font-medium">Vers</th>
                  <th className="px-2 py-2.5 text-right font-medium">Articles</th>
                  <th className="px-5 py-2.5 text-right font-medium">Valeur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transferts.map((t) => (
                  <FragmentTransfert
                    key={t.id}
                    t={t}
                    ouvert={ouvert === t.id}
                    onBasculer={() => setOuvert((o) => (o === t.id ? null : t.id))}
                    nomBoutique={(id) => boutiqueParId.get(id)?.nom ?? "Boutique non accessible"}
                    article={(id) => articleParId.get(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </div>
  );
}

function FragmentTransfert({
  t,
  ouvert,
  onBasculer,
  nomBoutique,
  article,
}: {
  t: TransfertStock;
  ouvert: boolean;
  onBasculer: () => void;
  nomBoutique: (id: string) => string;
  article: (id: string) => { designation: string; unite: string } | undefined;
}) {
  const lignes = t.lignes_transferts_stock ?? [];
  return (
    <>
      <tr className="cursor-pointer hover:bg-background" onClick={onBasculer}>
        <td className="px-5 py-3 font-mono text-xs font-medium text-primary">{t.numero}</td>
        <td className="whitespace-nowrap px-2 py-3">{formaterDate(t.date_transfert)}</td>
        <td className="px-2 py-3">{nomBoutique(t.boutique_source_id)}</td>
        <td className="px-2 py-3">{nomBoutique(t.boutique_destination_id)}</td>
        <td className="px-2 py-3 text-right">{lignes.length}</td>
        <td className="px-5 py-3 text-right font-medium"><Montant valeur={t.valeur_totale} /></td>
      </tr>
      {ouvert && (
        <tr className="bg-background">
          <td colSpan={6} className="px-5 py-3">
            <ul className="flex flex-col gap-1 text-sm">
              {lignes.map((l) => {
                const a = article(l.article_id);
                return (
                  <li key={l.id} className="flex justify-between gap-4">
                    <span>
                      {a?.designation ?? "Article"} — {formaterQuantite(l.quantite)} {a?.unite}
                    </span>
                    <Montant valeur={l.valeur} />
                  </li>
                );
              })}
            </ul>
            {t.notes && <p className="mt-2 text-xs text-muted">{t.notes}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

interface LigneSaisie {
  cle: number;
  articleId: string;
  quantite: string;
}

function FormulaireTransfert({
  onAnnuler,
  onEnregistrer,
}: {
  onAnnuler: () => void;
  onEnregistrer: (t: {
    sourceId: string;
    destinationId: string;
    lignes: { article_id: string; quantite: number }[];
    date: string;
    notes: string | null;
  }) => Promise<boolean>;
}) {
  const { entreprise, boutique } = useEspace();
  const { articles, boutiques } = useStock();
  const [sourceId, setSourceId] = useState(boutique?.id ?? boutiques[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState(boutiques.find((b) => b.id !== (boutique?.id ?? boutiques[0]?.id))?.id ?? "");
  const [lignes, setLignes] = useState<LigneSaisie[]>([{ cle: 1, articleId: "", quantite: "" }]);
  const [date, setDate] = useState(aujourdhui());
  const [notes, setNotes] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [dispo, setDispo] = useState<{ source: string; quantites: Map<string, number> } | null>(null);

  const eid = entreprise?.entreprise_id;
  useEffect(() => {
    if (!eid || !sourceId) return;
    let actif = true;
    chargerStocks(supabase, eid, sourceId)
      .then((s) => actif && setDispo({ source: sourceId, quantites: new Map(s.map((x) => [x.article_id, x.quantite])) }))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [eid, sourceId]);
  const disponibilites = dispo?.source === sourceId ? dispo.quantites : undefined;

  const choisis = useMemo(() => new Set(lignes.map((l) => l.articleId).filter(Boolean)), [lignes]);
  const saisies = lignes
    .map((l) => ({ article_id: l.articleId, quantite: lireQuantite(l.quantite) ?? 0 }))
    .filter((l) => l.article_id && l.quantite > 0);
  const valide = sourceId && destinationId && sourceId !== destinationId && saisies.length > 0;

  function maj(cle: number, champs: Partial<LigneSaisie>) {
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...champs } : l)));
  }

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!valide) return;
    setEnvoi(true);
    await onEnregistrer({ sourceId, destinationId, lignes: saisies, date, notes: notes.trim() || null });
    setEnvoi(false);
  }

  return (
    <Carte titre="Nouveau transfert">
      <form onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Liste
            libelle="De la boutique"
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              if (e.target.value === destinationId) setDestinationId("");
            }}
          >
            {boutiques.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </Liste>
          <Liste libelle="Vers la boutique" value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
            <option value="">Choisir…</option>
            {boutiques.filter((b) => b.id !== sourceId).map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </Liste>
          <Champ libelle="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          {lignes.map((l) => {
            const dispoLigne = l.articleId ? (disponibilites?.get(l.articleId) ?? 0) : null;
            const q = lireQuantite(l.quantite);
            const depasse = dispoLigne !== null && q !== null && q > dispoLigne;
            return (
              <div key={l.cle} className="grid items-start gap-2 sm:grid-cols-[1fr_9rem_auto]">
                <ChoixArticleStock
                  articles={articles}
                  valeur={l.articleId}
                  onChange={(id) => maj(l.cle, { articleId: id })}
                  exclure={choisis}
                  disponibilites={disponibilites}
                />
                <div>
                  <input
                    aria-label="Quantité"
                    inputMode="decimal"
                    placeholder="Quantité"
                    value={l.quantite}
                    onChange={(e) => maj(l.cle, { quantite: e.target.value })}
                    className={`montant h-10 w-full rounded-lg border bg-surface px-3 text-right text-sm outline-none focus:border-primary ${depasse ? "border-danger" : "border-border"}`}
                  />
                  {depasse && <p className="mt-1 text-xs text-danger">Disponible : {formaterQuantite(dispoLigne ?? 0)}</p>}
                </div>
                <Bouton
                  type="button"
                  variante="discret"
                  disabled={lignes.length === 1}
                  onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))}
                  aria-label="Retirer la ligne"
                >
                  Retirer
                </Bouton>
              </div>
            );
          })}
          <div>
            <Bouton
              type="button"
              variante="secondaire"
              onClick={() => setLignes((ls) => [...ls, { cle: Math.max(...ls.map((x) => x.cle)) + 1, articleId: "", quantite: "" }])}
            >
              + Ajouter un article
            </Bouton>
          </div>
        </div>

        <Champ libelle="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex. : réassort hebdomadaire" />

        <div className="flex justify-end gap-3">
          <Bouton type="button" variante="secondaire" onClick={onAnnuler}>Annuler</Bouton>
          <Bouton type="submit" chargement={envoi} disabled={!valide}>Transférer</Bouton>
        </div>
      </form>
    </Carte>
  );
}
