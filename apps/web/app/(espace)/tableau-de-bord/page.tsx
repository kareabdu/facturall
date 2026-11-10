"use client";

import {
  aujourdhui,
  chargerBalance,
  chargerExercices,
  chargerResumeVentes,
  chargerStocks,
  formaterDate,
  formaterXOF,
  LIBELLES_ROLES,
  niveauStock,
  nomPays,
  peutLireCompta,
  peutLireStock,
  peutVendre,
  type ResumeVentes,
} from "@facturall/core";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Montant } from "@/components/compta";
import { GraphiqueVentes } from "@/components/graphique";
import { Icone } from "@/components/icones";
import { Badge, Carte, Indicateur, LienBouton, Segments, Variation } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/** Trésorerie = soldes des comptes de classe 5 (caisse, banques, Mobile Money) de l'exercice en cours. */
function useTresorerie(entrepriseId: string | undefined, actif: boolean) {
  const [montant, setMontant] = useState<number | null>(null);
  useEffect(() => {
    if (!entrepriseId || !actif) return;
    let vivant = true;
    (async () => {
      const jour = aujourdhui();
      const exercice = (await chargerExercices(supabase, entrepriseId)).find(
        (e) => e.date_debut <= jour && jour <= e.date_fin,
      );
      if (!exercice) return;
      const balance = await chargerBalance(supabase, entrepriseId, exercice.id);
      const total = balance
        .filter((l) => l.classe === 5)
        .reduce((s, l) => s + l.solde_debiteur - l.solde_crediteur, 0);
      if (vivant) setMontant(total);
    })().catch(() => {});
    return () => {
      vivant = false;
    };
  }, [entrepriseId, actif]);
  return montant;
}

/** Articles en stock bas ou en rupture dans la boutique */
function useAlertesStock(entrepriseId: string | undefined, boutiqueId: string | undefined, actif: boolean) {
  const [resultat, setResultat] = useState<{ cle: string; bas: number; rupture: number } | null>(null);
  const cle = `${entrepriseId}|${boutiqueId}`;
  useEffect(() => {
    if (!entrepriseId || !boutiqueId || !actif) return;
    let vivant = true;
    chargerStocks(supabase, entrepriseId, boutiqueId)
      .then((s) => {
        const niveaux = s.map((l) => niveauStock(l.quantite, l.articles?.seuil_alerte));
        if (vivant) setResultat({ cle, bas: niveaux.filter((n) => n === "bas").length, rupture: niveaux.filter((n) => n === "rupture").length });
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [entrepriseId, boutiqueId, actif, cle]);
  return resultat?.cle === cle ? resultat : null;
}

function salutation() {
  const h = new Date().getHours();
  return h < 18 ? "Bonjour" : "Bonsoir";
}

export default function TableauDeBord() {
  const { session } = useSession();
  const { entreprise, boutique, boutiques, role, admin } = useEspace();
  const prenom = (session?.user.user_metadata?.nom_complet as string | undefined)?.split(" ")[0];
  const compta = peutLireCompta(role);
  const stock = peutLireStock(role);
  const eid = entreprise?.entreprise_id;
  const tresorerie = useTresorerie(eid, compta);
  const alertes = useAlertesStock(eid, boutique?.id, stock);

  const [portee, setPortee] = useState<"boutique" | "toutes">("toutes");
  const boutiqueFiltre = portee === "boutique" ? boutique?.id : undefined;
  const cle = `${eid}|${boutiqueFiltre ?? ""}`;
  const [resultat, setResultat] = useState<{ cle: string; resume: ResumeVentes } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!eid) return;
    let actif = true;
    chargerResumeVentes(supabase, eid, { boutiqueId: boutiqueFiltre })
      .then((resume) => actif && setResultat({ cle, resume }))
      .catch((e: Error) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [eid, boutiqueFiltre, cle]);

  const resume = resultat?.cle === cle ? resultat.resume : null;
  if (!entreprise) return null;
  const aucuneVente = resume !== null && resume.totalPeriode === 0 && resume.recentes.length === 0;
  const dateDuJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm capitalize text-muted">{dateDuJour}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {salutation()}
            {prenom ? ` ${prenom}` : ""} 👋
          </h1>
        </div>
        {peutVendre(role) && (
          <LienBouton href="/ventes/document?type=facture">
            <Icone nom="plus" taille={18} />
            Nouvelle facture
          </LienBouton>
        )}
      </div>

      {/* Bandeau : ventes des 30 derniers jours */}
      <section className="relative overflow-hidden rounded-3xl bg-panneau p-5 text-panneau-texte shadow-carte sm:p-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-accent/20 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-panneau-discret">Ventes des 30 derniers jours · TTC, avoirs déduits</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="chiffre montant text-3xl font-semibold text-white sm:text-4xl">
                {resume ? formaterXOF(resume.totalPeriode) : "…"}
              </p>
              {resume && <Variation valeur={resume.variation} />}
            </div>
            {resume?.variation != null && (
              <p className="mt-1 text-xs text-panneau-discret">par rapport aux 30 jours précédents</p>
            )}
          </div>
          {boutiques.filter((b) => b.active).length > 1 && (
            <Segments
              surPanneau
              libelle="Portée"
              valeur={portee}
              onChange={setPortee}
              options={[
                { valeur: "toutes", libelle: "Toutes les boutiques" },
                { valeur: "boutique", libelle: boutique?.nom ?? "Boutique" },
              ]}
            />
          )}
        </div>
        <div className="relative mt-6">
          {erreur ? (
            <p className="text-sm text-panneau-discret">{erreur}</p>
          ) : resume ? (
            <GraphiqueVentes serie={resume.serie} />
          ) : (
            <div className="h-40 animate-pulse rounded-xl bg-white/5" />
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Indicateur
          libelle="Ventes du jour"
          valeur={resume ? formaterXOF(resume.ventesDuJour) : "…"}
          detail={resume ? `${resume.facturesDuJour} facture(s)` : undefined}
          href="/ventes"
        />
        <Indicateur
          libelle="À encaisser"
          valeur={resume ? formaterXOF(resume.aEncaisser) : "…"}
          detail="Factures validées non réglées"
          href="/ventes/clients"
        />
        <Indicateur
          libelle="Trésorerie"
          valeur={!compta ? "—" : tresorerie === null ? "…" : formaterXOF(tresorerie)}
          detail="Caisse, banques et Mobile Money"
          href={compta ? "/comptabilite/balance" : undefined}
        />
        {stock ? (
          <Indicateur
            libelle={`Alertes de stock · ${boutique?.nom ?? ""}`}
            valeur={alertes ? String(alertes.bas + alertes.rupture) : "…"}
            detail={alertes ? `${alertes.rupture} en rupture · ${alertes.bas} stock bas` : undefined}
            ton={alertes && alertes.rupture > 0 ? "danger" : alertes && alertes.bas > 0 ? "attention" : "neutre"}
            href="/stock"
          />
        ) : (
          <Indicateur libelle="Boutique" valeur={boutique?.nom ?? "—"} detail={role ? LIBELLES_ROLES[role] : undefined} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Carte
          titre="Dernières factures"
          action={
            <Link href="/ventes" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Tout voir <Icone nom="fleche" taille={15} />
            </Link>
          }
        >
          {!resume ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-retrait" />
              ))}
            </div>
          ) : resume.recentes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              Aucune facture sur les 30 derniers jours.{" "}
              {peutVendre(role) && (
                <Link href="/ventes/document?type=facture" className="font-medium text-primary hover:underline">
                  Créer une facture
                </Link>
              )}
            </p>
          ) : (
            <ul className="-my-2 divide-y divide-border">
              {resume.recentes.map((f) => (
                <li key={f.id}>
                  <Link href={`/ventes/document?id=${f.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-retrait">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Icone nom="ventes" taille={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{f.client || "Client"}</span>
                      <span className="block text-xs text-muted">
                        {f.numero} · {formaterDate(f.date_document)}
                      </span>
                    </span>
                    <span className="text-right">
                      <Montant valeur={f.total_ttc} className="block text-sm font-semibold" />
                      {f.reste > 0 ? <Badge ton="orange">Reste {formaterXOF(f.reste, { symbole: false })}</Badge> : <Badge ton="vert">Réglée</Badge>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <div className="flex flex-col gap-6">
          {aucuneVente && (
            <Carte titre="Pour bien démarrer">
              <ol className="flex flex-col gap-3 text-sm">
                {[
                  { href: "/boutiques", titre: "Ajouter vos boutiques", texte: "Un point de vente = une boutique, avec son propre stock." },
                  { href: "/ventes/articles", titre: "Créer vos articles", texte: "Prix, TVA et suivi du stock." },
                  { href: "/membres", titre: "Inviter votre équipe", texte: "Comptable, gestionnaires, vendeurs : chacun avec ses droits." },
                  { href: "/ventes/document?type=facture", titre: "Établir votre première facture", texte: "La comptabilité SYSCOHADA se tient automatiquement." },
                ].map((e, i) => (
                  <li key={e.href} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{i + 1}</span>
                    <span>
                      <Link href={e.href} className="font-medium text-primary hover:underline">{e.titre}</Link>
                      <span className="block text-muted">{e.texte}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </Carte>
          )}

          <Carte
            titre="Votre entreprise"
            action={admin && <Link href="/entreprise" className="text-sm font-medium text-primary hover:underline">Modifier</Link>}
          >
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
              <dt className="text-muted">Raison sociale</dt>
              <dd className="font-medium">{entreprise.raison_sociale}</dd>
              <dt className="text-muted">Pays</dt>
              <dd>{nomPays(entreprise.pays)} · FCFA</dd>
              <dt className="text-muted">Comptabilité</dt>
              <dd>
                SYSCOHADA ·{" "}
                <Badge ton="vert">{entreprise.mode_comptable === "avance" ? "mode avancé" : "mode simplifié"}</Badge>
              </dd>
              <dt className="text-muted">Boutiques</dt>
              <dd>{boutiques.filter((b) => b.active).length}</dd>
              <dt className="text-muted">Votre rôle</dt>
              <dd>{role ? LIBELLES_ROLES[role] : "—"}</dd>
            </dl>
          </Carte>
        </div>
      </div>
    </div>
  );
}
