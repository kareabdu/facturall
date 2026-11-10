"use client";

import {
  aujourdhui,
  chargerInventaire,
  chargerStocks,
  enregistrerInventaire,
  formaterDate,
  formaterQuantite,
  formaterXOF,
  lireQuantite,
  supprimerInventaire,
  validerInventaire,
  type Inventaire,
  type LigneStock,
} from "@facturall/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { Montant } from "@/components/compta";
import { QuantiteSignee } from "@/components/stock";
import { Alerte, Badge, Bouton, Carte, Champ, Chargement, Indicateur, Liste } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { useStock } from "@/lib/stock";
import { supabase } from "@/lib/supabase";

export default function PageInventaire() {
  return (
    <Suspense fallback={<Chargement />}>
      <ChargeurInventaire />
    </Suspense>
  );
}

function ChargeurInventaire() {
  const params = useSearchParams();
  const id = params.get("id");
  // Toute l'URL : après une validation, on revient sur le même id avec « &v=1 » et il faut recharger
  const cle = params.toString();
  const [resultat, setResultat] = useState<{ cle: string; inventaire: Inventaire } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let actif = true;
    chargerInventaire(supabase, id)
      .then((inventaire) => actif && setResultat({ cle, inventaire }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [id, cle]);

  if (!id) return <Editeur key="nouveau" inventaire={null} />;
  if (erreur) return <Alerte>{erreur}</Alerte>;
  const inventaire = resultat?.cle === cle ? resultat.inventaire : null;
  if (!inventaire) return <Chargement />;
  if (inventaire.statut === "valide") return <InventaireValide inventaire={inventaire} />;
  return <Editeur key={inventaire.id} inventaire={inventaire} />;
}

function EnTete({ titre, sousTitre }: { titre: string; sousTitre?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 print:hidden">
      <div>
        <Link href="/stock/inventaires" className="text-sm text-muted hover:text-foreground">← Inventaires</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{titre}</h1>
        {sousTitre && <p className="mt-1 text-sm text-muted">{sousTitre}</p>}
      </div>
    </div>
  );
}

function Editeur({ inventaire }: { inventaire: Inventaire | null }) {
  const { entreprise, boutique } = useEspace();
  const { articles, boutiques, boutiqueParId, peutGerer } = useStock();
  const router = useRouter();
  const [boutiqueId, setBoutiqueId] = useState(inventaire?.boutique_id ?? boutique?.id ?? boutiques[0]?.id ?? "");
  const [date, setDate] = useState(inventaire?.date_inventaire ?? aujourdhui());
  const [notes, setNotes] = useState(inventaire?.notes ?? "");
  const [comptes, setComptes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (inventaire?.lignes_inventaire ?? []).map((l) => [l.article_id, String(l.quantite_comptee).replace(".", ",")]),
    ),
  );
  const [recherche, setRecherche] = useState("");
  const [stocks, setStocks] = useState<{ boutique: string; lignes: Map<string, LigneStock> } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<"brouillon" | "valider" | "supprimer" | null>(null);

  const eid = entreprise?.entreprise_id;
  useEffect(() => {
    if (!eid || !boutiqueId) return;
    let actif = true;
    chargerStocks(supabase, eid, boutiqueId)
      .then((s) => actif && setStocks({ boutique: boutiqueId, lignes: new Map(s.map((x) => [x.article_id, x])) }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [eid, boutiqueId]);
  const stockBoutique = stocks?.boutique === boutiqueId ? stocks.lignes : null;

  const actifs = useMemo(() => articles.filter((a) => a.actif || comptes[a.id] !== undefined), [articles, comptes]);
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return actifs.filter((a) => !q || a.designation.toLowerCase().includes(q) || (a.reference ?? "").toLowerCase().includes(q));
  }, [actifs, recherche]);

  const saisies = useMemo(
    () =>
      actifs
        .map((a) => ({ article_id: a.id, quantite_comptee: lireQuantite(comptes[a.id] ?? "") }))
        .filter((l): l is { article_id: string; quantite_comptee: number } => l.quantite_comptee !== null && l.quantite_comptee >= 0),
    [actifs, comptes],
  );

  const ecartTotal = useMemo(() => {
    if (!stockBoutique) return 0;
    return saisies.reduce((s, l) => {
      const st = stockBoutique.get(l.article_id);
      return s + Math.round((l.quantite_comptee - (st?.quantite ?? 0)) * (st?.cmup ?? 0));
    }, 0);
  }, [saisies, stockBoutique]);

  if (!eid) return null;
  if (!peutGerer) return <Alerte>Seuls les gestionnaires, comptables et administrateurs peuvent faire un inventaire.</Alerte>;

  async function enregistrer(): Promise<string | null> {
    if (!eid) return null;
    return enregistrerInventaire(supabase, {
      entrepriseId: eid,
      boutiqueId,
      lignes: saisies,
      date,
      notes: notes.trim() || null,
      inventaireId: inventaire?.id ?? null,
    });
  }

  async function brouillon() {
    setErreur(null);
    setMessage(null);
    setEnvoi("brouillon");
    try {
      const id = await enregistrer();
      if (!inventaire && id) router.replace(`/stock/inventaire?id=${id}`);
      else setMessage("Brouillon enregistré.");
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(null);
    }
  }

  async function valider() {
    const nb = saisies.length;
    if (
      !window.confirm(
        `Valider l'inventaire de ${boutiqueParId.get(boutiqueId)?.nom} ?\n\n${nb} article(s) compté(s). Le stock de ces articles sera ramené aux quantités comptées. Les articles non comptés ne changent pas.\n\nUn inventaire validé ne peut plus être modifié.`,
      )
    ) {
      return;
    }
    setErreur(null);
    setEnvoi("valider");
    try {
      const id = await enregistrer();
      if (id) {
        await validerInventaire(supabase, id);
        router.replace(`/stock/inventaire?id=${id}&v=1`);
      }
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(null);
    }
  }

  async function supprimer() {
    if (!inventaire || !window.confirm("Supprimer ce brouillon d'inventaire ?")) return;
    setEnvoi("supprimer");
    try {
      await supprimerInventaire(supabase, inventaire.id);
      router.replace("/stock/inventaires");
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(null);
    }
  }

  return (
    <div>
      <EnTete
        titre={inventaire ? "Inventaire (brouillon)" : "Nouvel inventaire"}
        sousTitre="Saisissez la quantité réellement présente. Laissez vide un article non compté."
      />
      <div className="flex flex-col gap-4">
        {erreur && <Alerte>{erreur}</Alerte>}
        {message && <Alerte type="succes">{message}</Alerte>}

        <Carte>
          <div className="grid gap-4 sm:grid-cols-3">
            <Liste libelle="Boutique" value={boutiqueId} onChange={(e) => setBoutiqueId(e.target.value)}>
              {boutiques.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </Liste>
            <Champ libelle="Date du comptage" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Champ libelle="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex. : inventaire annuel" />
          </div>
        </Carte>

        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <input
            aria-label="Rechercher un article"
            placeholder="Rechercher un article…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="h-10 min-w-48 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary sm:max-w-72"
          />
          <Bouton
            variante="secondaire"
            onClick={() =>
              setComptes((c) => {
                const n = { ...c };
                for (const a of visibles) {
                  if (n[a.id] === undefined || n[a.id] === "") {
                    n[a.id] = formaterQuantite(Math.max(0, stockBoutique?.get(a.id)?.quantite ?? 0)).replace(/\s/g, "");
                  }
                }
                return n;
              })
            }
            disabled={!stockBoutique}
            title="Préremplit les articles non saisis avec la quantité théorique"
          >
            Préremplir avec le théorique
          </Bouton>
          <Bouton variante="discret" onClick={() => window.print()}>Imprimer la feuille de comptage</Bouton>
        </div>

        <Carte>
          {!stockBoutique ? (
            <Chargement />
          ) : (
            <div className="-m-5 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="border-b border-border bg-surface-retrait text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Article</th>
                    <th className="px-2 py-2.5 text-right font-medium">Théorique</th>
                    <th className="w-36 px-2 py-2.5 text-right font-medium">Compté</th>
                    <th className="px-2 py-2.5 text-right font-medium">Écart</th>
                    <th className="px-5 py-2.5 text-right font-medium">Valeur écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibles.map((a) => {
                    const st = stockBoutique.get(a.id);
                    const theo = st?.quantite ?? 0;
                    const saisie = comptes[a.id] ?? "";
                    const q = lireQuantite(saisie);
                    const invalide = saisie.trim() !== "" && (q === null || q < 0);
                    const ecart = q !== null && q >= 0 ? Math.round((q - theo) * 1000) / 1000 : null;
                    return (
                      <tr key={a.id}>
                        <td className="px-5 py-2">
                          <span className="font-medium">{a.designation}</span>
                          {a.reference && <span className="ml-2 font-mono text-xs text-muted">{a.reference}</span>}
                        </td>
                        <td className="montant px-2 py-2 text-right text-muted">
                          {formaterQuantite(theo)} <span className="text-xs">{a.unite}</span>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            aria-label={`Quantité comptée : ${a.designation}`}
                            inputMode="decimal"
                            value={saisie}
                            onChange={(e) => setComptes((c) => ({ ...c, [a.id]: e.target.value }))}
                            className={`montant h-9 w-full rounded-xl border bg-surface px-3 text-right text-sm outline-none focus:border-primary ${invalide ? "border-danger" : "border-border"}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          {ecart === null ? "" : ecart === 0 ? <span className="text-muted">0</span> : <QuantiteSignee valeur={ecart} />}
                        </td>
                        <td className={`px-5 py-2 text-right ${ecart !== null && ecart < 0 ? "text-danger" : ""}`}>
                          {ecart ? <Montant valeur={Math.round(ecart * (st?.cmup ?? 0))} /> : ""}
                        </td>
                      </tr>
                    );
                  })}
                  {visibles.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-6 text-center text-muted">Aucun article suivi en stock.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Carte>

        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <p className="text-sm text-muted">
            {saisies.length} article(s) compté(s) · écart estimé{" "}
            <span className={`montant font-medium ${ecartTotal < 0 ? "text-danger" : "text-foreground"}`}>{formaterXOF(ecartTotal)}</span>
          </p>
          <div className="ml-auto flex flex-wrap gap-3">
            {inventaire && (
              <Bouton variante="danger" onClick={() => void supprimer()} chargement={envoi === "supprimer"} disabled={!!envoi}>
                Supprimer
              </Bouton>
            )}
            <Bouton variante="secondaire" onClick={() => void brouillon()} chargement={envoi === "brouillon"} disabled={!!envoi || saisies.length === 0}>
              Enregistrer le brouillon
            </Bouton>
            <Bouton onClick={() => void valider()} chargement={envoi === "valider"} disabled={!!envoi || saisies.length === 0}>
              Valider l&apos;inventaire
            </Bouton>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventaireValide({ inventaire: i }: { inventaire: Inventaire }) {
  const { boutiqueParId, articleParId } = useStock();
  const lignes = i.lignes_inventaire ?? [];
  const avecEcart = lignes.filter((l) => l.ecart);
  return (
    <div>
      <EnTete
        titre={`Inventaire ${i.numero}`}
        sousTitre={`${boutiqueParId.get(i.boutique_id)?.nom ?? ""} · ${formaterDate(i.date_inventaire)}${i.notes ? ` · ${i.notes}` : ""}`}
      />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Articles comptés", String(lignes.length), ""],
            ["Avec écart", String(avecEcart.length), avecEcart.length ? "text-warning" : ""],
            ["Écart valorisé", formaterXOF(i.ecart_valeur), i.ecart_valeur < 0 ? "text-danger" : ""],
          ].map(([libelle, valeur, classe]) => (
            <Indicateur
              key={libelle}
              libelle={libelle}
              valeur={valeur}
              ton={classe.includes("danger") ? "danger" : classe.includes("warning") ? "attention" : "neutre"}
            />
          ))}
          <div className="flex items-center rounded-2xl border border-border bg-surface p-4 shadow-carte">
            <Badge ton="vert">Validé — inaltérable</Badge>
          </div>
        </div>
        <Carte>
          <div className="-m-5 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="border-b border-border bg-surface-retrait text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Article</th>
                  <th className="px-2 py-2.5 text-right font-medium">Théorique</th>
                  <th className="px-2 py-2.5 text-right font-medium">Compté</th>
                  <th className="px-2 py-2.5 text-right font-medium">Écart</th>
                  <th className="px-5 py-2.5 text-right font-medium">Valeur écart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lignes.map((l) => {
                  const a = articleParId.get(l.article_id);
                  return (
                    <tr key={l.id}>
                      <td className="px-5 py-3 font-medium">{a?.designation ?? "Article"}</td>
                      <td className="montant px-2 py-3 text-right text-muted">{formaterQuantite(l.quantite_theorique ?? 0)}</td>
                      <td className="montant px-2 py-3 text-right">{formaterQuantite(l.quantite_comptee)} <span className="text-xs text-muted">{a?.unite}</span></td>
                      <td className="px-2 py-3 text-right">{l.ecart ? <QuantiteSignee valeur={l.ecart} /> : <span className="text-muted">0</span>}</td>
                      <td className={`px-5 py-3 text-right ${(l.valeur_ecart ?? 0) < 0 ? "text-danger" : ""}`}><Montant valeur={l.valeur_ecart ?? 0} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Carte>
      </div>
    </div>
  );
}
