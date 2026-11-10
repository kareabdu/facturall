"use client";

import {
  chargerComptes,
  creerArticle,
  creerTauxTva,
  formaterXOF,
  modifierArticle,
  modifierParametresVente,
  modifierTauxTva,
  peutSaisirCompta,
  type Article,
  type Compte,
  type SaisieArticle,
} from "@facturall/core";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { ChampMontant, ChoixCompte } from "@/components/compta";
import { Alerte, Badge, Bouton, Carte, Champ, Liste } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";
import { useVentes } from "@/lib/ventes";

export default function PageArticles() {
  const { entreprise, role } = useEspace();
  const { articles, taux, tauxParId, tauxDefaut, gereCatalogue, parametres, rafraichir } = useVentes();
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState<Article | "nouveau" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const compta = peutSaisirCompta(role);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return articles.filter((a) => !q || a.designation.toLowerCase().includes(q) || (a.reference ?? "").toLowerCase().includes(q));
  }, [articles, recherche]);

  async function agir(fn: () => Promise<unknown>, succes: string) {
    setErreur(null);
    setMessage(null);
    try {
      await fn();
      await rafraichir();
      setMessage(succes);
      return true;
    } catch (e) {
      setErreur((e as Error).message);
      return false;
    }
  }

  if (!entreprise) return null;
  const eid = entreprise.entreprise_id;

  return (
    <div className="flex flex-col gap-6">
      {erreur && <Alerte>{erreur}</Alerte>}
      {message && <Alerte type="succes">{message}</Alerte>}

      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Rechercher un article"
          placeholder="Désignation ou référence…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="h-10 min-w-56 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary sm:max-w-80"
        />
        {gereCatalogue && <Bouton className="ml-auto" onClick={() => setEdition("nouveau")}>Nouvel article</Bouton>}
      </div>

      {edition && (
        <FormulaireArticle
          article={edition === "nouveau" ? null : edition}
          onAnnuler={() => setEdition(null)}
          onEnregistrer={async (a) => {
            const ok = await agir(
              () => (edition === "nouveau" ? creerArticle(supabase, eid, a) : modifierArticle(supabase, edition.id, a)),
              edition === "nouveau" ? `Article « ${a.designation} » créé.` : "Article mis à jour.",
            );
            if (ok) setEdition(null);
          }}
        />
      )}

      <Carte titre="Articles" action={<span className="text-sm text-muted">{articles.length} article(s)</span>}>
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Réf.</th>
                <th className="px-2 py-2.5 font-medium">Désignation</th>
                <th className="px-2 py-2.5 font-medium">Type</th>
                <th className="px-2 py-2.5 font-medium">TVA</th>
                <th className="px-2 py-2.5 text-right font-medium">Prix HT</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtres.map((a) => (
                <tr key={a.id} className={a.actif ? "" : "text-muted"}>
                  <td className="px-5 py-3 font-mono text-xs">{a.reference}</td>
                  <td className="px-2 py-3">
                    <span className={a.actif ? "font-medium" : "line-through"}>{a.designation}</span>
                    <span className="ml-2 text-xs text-muted">/ {a.unite}</span>
                  </td>
                  <td className="px-2 py-3">
                    <span className="flex gap-1">
                      <Badge>{a.type === "service" ? "Service" : "Bien"}</Badge>
                      {a.suivi_stock && <Badge ton="vert">Stocké</Badge>}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-muted">{(a.taux_tva_id ? tauxParId.get(a.taux_tva_id) : tauxDefaut)?.libelle}</td>
                  <td className="montant px-2 py-3 text-right font-medium">{formaterXOF(a.prix_vente)}</td>
                  <td className="px-5 py-3 text-right">
                    {gereCatalogue && (
                      <span className="flex justify-end gap-1">
                        <button className="rounded px-2 py-1 text-xs text-muted hover:bg-background hover:text-foreground" onClick={() => setEdition(a)}>Modifier</button>
                        <button
                          className="rounded px-2 py-1 text-xs text-muted hover:bg-background hover:text-foreground"
                          onClick={() => void agir(() => modifierArticle(supabase, a.id, { actif: !a.actif }), a.actif ? "Article désactivé." : "Article réactivé.")}
                        >
                          {a.actif ? "Désactiver" : "Réactiver"}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtres.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-muted">
                  Aucun article. Vous pouvez aussi facturer avec une désignation libre.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Carte>

      <Carte titre="Taux de TVA">
        <ul className="-my-2 divide-y divide-border text-sm">
          {taux.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className={`min-w-0 flex-1 font-medium ${t.actif ? "" : "text-muted line-through"}`}>{t.libelle}</span>
              <span className="montant w-16 text-right">{String(t.taux).replace(".", ",")} %</span>
              {t.par_defaut && <Badge ton="vert">Par défaut</Badge>}
              {compta && !t.par_defaut && (
                <Bouton variante="discret" className="h-8 px-3" onClick={() => void agir(() => modifierTauxTva(supabase, t.id, { actif: !t.actif }), "Taux mis à jour.")}>
                  {t.actif ? "Désactiver" : "Réactiver"}
                </Bouton>
              )}
            </li>
          ))}
        </ul>
        {compta && (
          <NouveauTaux
            onCreer={(libelle, valeur) =>
              agir(
                () =>
                  creerTauxTva(supabase, eid, {
                    libelle,
                    taux: valeur,
                    compte_collecte_id: valeur > 0 ? tauxDefaut?.compte_collecte_id ?? null : null,
                    compte_deductible_id: valeur > 0 ? tauxDefaut?.compte_deductible_id ?? null : null,
                  }),
                `Taux « ${libelle} » ajouté.`,
              )
            }
          />
        )}
        <p className="mt-3 text-xs text-muted">
          Taux proposés par défaut : 18 % (directive UEMOA), 19 % au Niger. Vérifiez le taux applicable à votre activité
          (taux réduits, exonérations) avec votre conseil fiscal.
        </p>
      </Carte>

      {compta && parametres && (
        <ParametresFacture
          delai={parametres.delai_paiement_jours}
          mentions={parametres.mentions_facture}
          onEnregistrer={(delai, mentions) =>
            agir(() => modifierParametresVente(supabase, eid, { delai_paiement_jours: delai, mentions_facture: mentions }), "Paramètres enregistrés.")
          }
        />
      )}
    </div>
  );
}

function FormulaireArticle({
  article,
  onAnnuler,
  onEnregistrer,
}: {
  article: Article | null;
  onAnnuler: () => void;
  onEnregistrer: (a: SaisieArticle) => Promise<void>;
}) {
  const { taux, tauxDefaut } = useVentes();
  const [f, setF] = useState<SaisieArticle>({
    reference: article?.reference ?? "",
    designation: article?.designation ?? "",
    type: article?.type ?? "bien",
    unite: article?.unite ?? "unité",
    prix_vente: article?.prix_vente ?? 0,
    taux_tva_id: article?.taux_tva_id ?? null,
    compte_vente_id: article?.compte_vente_id ?? null,
    suivi_stock: article ? article.suivi_stock : true,
    seuil_alerte: article?.seuil_alerte ?? null,
  });
  const [seuil, setSeuil] = useState(article?.seuil_alerte != null ? String(article.seuil_alerte).replace(".", ",") : "");
  const [compteSpecifique, setCompteSpecifique] = useState(!!article?.compte_vente_id);
  const [envoi, setEnvoi] = useState(false);
  const { comptes } = useComptesVente();

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    await onEnregistrer({
      ...f,
      reference: f.reference?.trim() || null,
      designation: f.designation.trim(),
      unite: f.unite.trim() || "unité",
      compte_vente_id: compteSpecifique ? f.compte_vente_id : null,
      suivi_stock: f.type === "bien" && !!f.suivi_stock,
      seuil_alerte: f.type === "bien" && f.suivi_stock && seuil.trim() !== "" ? Number(seuil.replace(",", ".")) : null,
    });
    setEnvoi(false);
  }

  return (
    <Carte titre={article ? `Modifier ${article.designation}` : "Nouvel article"}>
      <form onSubmit={soumettre} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" noValidate>
        <Champ libelle="Désignation" className="sm:col-span-2" value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} required />
        <Champ libelle="Référence" value={f.reference ?? ""} onChange={(e) => setF({ ...f, reference: e.target.value.replace(/[^A-Za-z0-9._/-]/g, "") })} placeholder="RIZ25" />
        <Liste libelle="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "bien" | "service" })}>
          <option value="bien">Bien (marchandise)</option>
          <option value="service">Service</option>
        </Liste>
        <ChampMontant libelle="Prix de vente HT (FCFA)" valeur={f.prix_vente} onChange={(v) => setF({ ...f, prix_vente: v })} />
        <Champ libelle="Unité" value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value })} placeholder="unité, sac, kg, heure…" />
        <Liste libelle="TVA" value={f.taux_tva_id ?? ""} onChange={(e) => setF({ ...f, taux_tva_id: e.target.value || null })}>
          <option value="">Par défaut ({tauxDefaut?.libelle})</option>
          {taux.filter((t) => t.actif).map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
        </Liste>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="accent-primary" checked={compteSpecifique} onChange={(e) => setCompteSpecifique(e.target.checked)} />
            Compte de vente spécifique
          </label>
          {compteSpecifique ? (
            <ChoixCompte comptes={comptes} valeur={f.compte_vente_id ?? ""} onChange={(id) => setF({ ...f, compte_vente_id: id })} placeholder="70x…" />
          ) : (
            <span className="text-xs text-muted">{f.type === "service" ? "706 Services vendus" : "701 Ventes de marchandises"}</span>
          )}
        </div>
        {f.type === "bien" && (
          <>
            <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2 lg:col-span-1 lg:pt-7">
              <input
                type="checkbox"
                className="accent-primary"
                checked={!!f.suivi_stock}
                onChange={(e) => setF({ ...f, suivi_stock: e.target.checked })}
              />
              Suivre le stock de cet article
            </label>
            {f.suivi_stock && (
              <Champ
                libelle="Seuil d'alerte"
                inputMode="decimal"
                value={seuil}
                onChange={(e) => setSeuil(e.target.value.replace(/[^\d,.]/g, ""))}
                placeholder="Ex. 5"
                aide="Stock bas signalé à partir de cette quantité"
              />
            )}
          </>
        )}
        <div className="flex justify-end gap-3 sm:col-span-2 lg:col-span-4">
          <Bouton type="button" variante="secondaire" onClick={onAnnuler}>Annuler</Bouton>
          <Bouton type="submit" chargement={envoi} disabled={f.designation.trim().length < 2}>Enregistrer</Bouton>
        </div>
      </form>
    </Carte>
  );
}

/** Comptes de produits (classe 7) mouvementables, chargés à l'ouverture du formulaire */
function useComptesVente() {
  const { entreprise } = useEspace();
  const [comptes, setComptes] = useState<Compte[]>([]);
  useEffect(() => {
    if (!entreprise) return;
    let actif = true;
    chargerComptes(supabase, entreprise.entreprise_id)
      .then((c) => {
        if (actif) setComptes(c.filter((x) => x.classe === 7 && x.mouvementable && x.actif));
      })
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [entreprise]);
  return { comptes };
}

function NouveauTaux({ onCreer }: { onCreer: (libelle: string, taux: number) => Promise<boolean> }) {
  const [ouvert, setOuvert] = useState(false);
  const [libelle, setLibelle] = useState("");
  const [valeur, setValeur] = useState("");
  if (!ouvert) {
    return (
      <div className="mt-4">
        <Bouton variante="secondaire" onClick={() => setOuvert(true)}>+ Ajouter un taux (ex. taux réduit)</Bouton>
      </div>
    );
  }
  const taux = Number(valeur.replace(",", "."));
  return (
    <form
      className="mt-4 grid gap-4 rounded-lg bg-background p-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onCreer(libelle.trim(), taux)) setOuvert(false);
      }}
    >
      <Champ libelle="Libellé" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="TVA réduite 10 %" />
      <Champ libelle="Taux (%)" inputMode="decimal" value={valeur} onChange={(e) => setValeur(e.target.value)} placeholder="10" />
      <div className="flex gap-2">
        <Bouton type="button" variante="secondaire" onClick={() => setOuvert(false)}>Annuler</Bouton>
        <Bouton type="submit" disabled={libelle.trim().length < 2 || !(taux >= 0 && taux <= 100) || valeur === ""}>Ajouter</Bouton>
      </div>
    </form>
  );
}

function ParametresFacture({
  delai,
  mentions,
  onEnregistrer,
}: {
  delai: number;
  mentions: string | null;
  onEnregistrer: (delai: number, mentions: string | null) => Promise<boolean>;
}) {
  const [d, setD] = useState(String(delai));
  const [m, setM] = useState(mentions ?? "");
  return (
    <Carte titre="Paramètres des factures">
      <form
        className="grid gap-4 sm:grid-cols-[12rem_1fr]"
        onSubmit={(e) => {
          e.preventDefault();
          void onEnregistrer(Math.min(365, Number(d) || 0), m.trim() || null);
        }}
      >
        <Champ libelle="Délai de paiement (jours)" inputMode="numeric" value={d} onChange={(e) => setD(e.target.value.replace(/\D/g, ""))} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Mentions en bas de facture</span>
          <textarea
            rows={3}
            value={m}
            onChange={(e) => setM(e.target.value)}
            placeholder="Ex. : Paiement par Wave au 77 000 00 00 · Banque XYZ, IBAN… · Pénalités de retard…"
            className="rounded-lg border border-border bg-surface p-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="flex justify-end sm:col-span-2">
          <Bouton type="submit">Enregistrer</Bouton>
        </div>
      </form>
    </Carte>
  );
}
