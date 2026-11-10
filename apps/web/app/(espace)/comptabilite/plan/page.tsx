"use client";

import {
  CLASSES_SYSCOHADA,
  creerCompte,
  creerJournal,
  LIBELLES_TYPES_JOURNAUX,
  modifierCompte,
  modifierJournal,
  TYPES_TRESORERIE,
  type Compte,
  type TypeJournal,
} from "@facturall/core";
import { useMemo, useState, type FormEvent } from "react";

import { ChoixCompte } from "@/components/compta";
import { Alerte, Badge, Bouton, Carte, Champ, Liste } from "@/components/ui";
import { useCompta } from "@/lib/compta";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

export default function PagePlan() {
  const { entreprise } = useEspace();
  const { comptes, journaux, compteParId, peutSaisir, rafraichir } = useCompta();
  const [recherche, setRecherche] = useState("");
  const [classe, setClasse] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return comptes.filter(
      (c) =>
        (classe === null || c.classe === classe) &&
        (!q || c.numero.startsWith(q) || c.libelle.toLowerCase().includes(q)),
    );
  }, [comptes, recherche, classe]);

  async function agir(fn: () => Promise<unknown>, succes: string) {
    setErreur(null);
    setMessage(null);
    try {
      await fn();
      await rafraichir();
      setMessage(succes);
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  if (!entreprise) return null;
  const eid = entreprise.entreprise_id;

  return (
    <div className="flex flex-col gap-6">
      {erreur && <Alerte>{erreur}</Alerte>}
      {message && <Alerte type="succes">{message}</Alerte>}

      {peutSaisir && (
        <NouveauCompte comptes={comptes} onCreer={(n, l) => agir(() => creerCompte(supabase, eid, n, l), `Compte ${n} créé.`)} />
      )}

      <Carte
        titre="Plan comptable"
        action={<span className="text-sm text-muted">{comptes.length} comptes · base SYSCOHADA révisé</span>}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            aria-label="Rechercher un compte"
            placeholder="Rechercher (numéro ou intitulé)…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="h-9 min-w-56 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
          />
          <div className="flex flex-wrap gap-1">
            {[null, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
              <button
                key={c ?? "tout"}
                onClick={() => setClasse(c)}
                title={c ? CLASSES_SYSCOHADA[c] : "Toutes les classes"}
                className={`h-9 min-w-9 rounded-lg px-2.5 text-sm font-medium ${
                  classe === c ? "bg-primary text-on-primary" : "bg-background text-muted hover:text-foreground"
                }`}
              >
                {c ?? "Toutes"}
              </button>
            ))}
          </div>
        </div>
        <ul className="-mx-5 max-h-[32rem] divide-y divide-border overflow-y-auto border-y border-border text-sm">
          {filtres.map((c) => (
            <LigneCompte
              key={c.id}
              compte={c}
              modifiable={peutSaisir}
              onRenommer={(l) => agir(() => modifierCompte(supabase, c.id, { libelle: l }), "Intitulé modifié.")}
              onBasculer={() =>
                agir(() => modifierCompte(supabase, c.id, { actif: !c.actif }), c.actif ? "Compte désactivé." : "Compte réactivé.")
              }
            />
          ))}
          {filtres.length === 0 && <li className="px-5 py-4 text-muted">Aucun compte.</li>}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Les comptes en gris sont des comptes de regroupement : on saisit sur leurs sous-comptes. Les intitulés de la base
          sont à faire valider par votre expert-comptable ; vous pouvez les adapter.
        </p>
      </Carte>

      <Carte titre="Journaux">
        <ul className="-my-2 divide-y divide-border text-sm">
          {journaux.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="w-12 font-mono text-xs font-semibold">{j.code}</span>
              <span className={`min-w-0 flex-1 ${j.actif ? "" : "text-muted line-through"}`}>{j.libelle}</span>
              <Badge>{LIBELLES_TYPES_JOURNAUX[j.type]}</Badge>
              {j.compte_tresorerie_id && (
                <span className="font-mono text-xs text-muted">{compteParId.get(j.compte_tresorerie_id)?.numero}</span>
              )}
              {peutSaisir && (
                <Bouton
                  variante="discret"
                  className="h-8 px-3"
                  onClick={() =>
                    agir(() => modifierJournal(supabase, j.id, { actif: !j.actif }), j.actif ? "Journal désactivé." : "Journal réactivé.")
                  }
                >
                  {j.actif ? "Désactiver" : "Réactiver"}
                </Bouton>
              )}
            </li>
          ))}
        </ul>
        {peutSaisir && (
          <NouveauJournal
            comptes={comptes}
            onCreer={(j) => agir(() => creerJournal(supabase, eid, j), `Journal ${j.code} créé.`)}
          />
        )}
      </Carte>
    </div>
  );
}

function LigneCompte({
  compte: c,
  modifiable,
  onRenommer,
  onBasculer,
}: {
  compte: Compte;
  modifiable: boolean;
  onRenommer: (libelle: string) => Promise<void>;
  onBasculer: () => Promise<void>;
}) {
  const [edition, setEdition] = useState(false);
  const [libelle, setLibelle] = useState(c.libelle);
  const indentation = Math.max(0, c.numero.length - 2) * 12;

  return (
    <li className="flex items-center gap-3 px-5 py-2">
      <span className="w-16 shrink-0 font-mono text-xs" style={{ paddingLeft: indentation }}>
        {c.numero}
      </span>
      {edition ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await onRenommer(libelle.trim());
            setEdition(false);
          }}
        >
          <input
            autoFocus
            aria-label="Intitulé"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            className="h-8 flex-1 rounded-md border border-border px-2 text-sm outline-none focus:border-primary"
          />
          <Bouton type="submit" className="h-8 px-3">OK</Bouton>
          <Bouton type="button" variante="discret" className="h-8 px-3" onClick={() => setEdition(false)}>
            Annuler
          </Bouton>
        </form>
      ) : (
        <>
          <span
            className={`min-w-0 flex-1 truncate ${!c.actif ? "text-muted line-through" : !c.mouvementable ? "font-medium text-muted" : ""}`}
          >
            {c.libelle}
          </span>
          {c.origine === "entreprise" && <Badge ton="vert">Ajouté</Badge>}
          {modifiable && (
            <span className="flex shrink-0 gap-1">
              <button className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-retrait hover:text-foreground" onClick={() => setEdition(true)}>
                Renommer
              </button>
              <button className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-retrait hover:text-foreground" onClick={() => void onBasculer()}>
                {c.actif ? "Désactiver" : "Réactiver"}
              </button>
            </span>
          )}
        </>
      )}
    </li>
  );
}

function NouveauCompte({ comptes, onCreer }: { comptes: Compte[]; onCreer: (numero: string, libelle: string) => Promise<void> }) {
  const [numero, setNumero] = useState("");
  const [libelle, setLibelle] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const parent = useMemo(
    () =>
      comptes
        .filter((c) => numero.length > c.numero.length && numero.startsWith(c.numero))
        .sort((a, b) => b.numero.length - a.numero.length)[0],
    [comptes, numero],
  );

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    await onCreer(numero, libelle.trim());
    setEnvoi(false);
    setNumero("");
    setLibelle("");
  }

  return (
    <Carte titre="Ajouter un sous-compte">
      <form onSubmit={soumettre} className="grid gap-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <Champ
          libelle="Numéro"
          inputMode="numeric"
          value={numero}
          onChange={(e) => setNumero(e.target.value.replace(/\D/g, "").slice(0, 12))}
          placeholder="Ex. : 4111"
          required
        />
        <Champ
          libelle="Intitulé"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Ex. : Clients — grossistes"
          aide={parent ? `Rattaché à ${parent.numero} ${parent.libelle}` : numero.length >= 3 ? "Aucun compte parent trouvé" : undefined}
          required
        />
        <Bouton type="submit" chargement={envoi} disabled={!parent || libelle.trim().length < 2}>
          Ajouter
        </Bouton>
      </form>
    </Carte>
  );
}

function NouveauJournal({
  comptes,
  onCreer,
}: {
  comptes: Compte[];
  onCreer: (j: { code: string; libelle: string; type: TypeJournal; compteTresorerieId: string | null }) => Promise<void>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [type, setType] = useState<TypeJournal>("banque");
  const [compteId, setCompteId] = useState("");
  const tresorerie = TYPES_TRESORERIE.includes(type);
  const comptesClasse5 = comptes.filter((c) => c.classe === 5 && c.mouvementable && c.actif);

  if (!ouvert) {
    return (
      <div className="mt-4">
        <Bouton variante="secondaire" onClick={() => setOuvert(true)}>
          + Ajouter un journal (ex. 2e banque)
        </Bouton>
      </div>
    );
  }

  return (
    <form
      className="mt-4 grid gap-4 rounded-lg bg-background p-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await onCreer({ code, libelle: libelle.trim(), type, compteTresorerieId: tresorerie ? compteId : null });
        setOuvert(false);
      }}
    >
      <Champ libelle="Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="BQ2" required />
      <Champ libelle="Intitulé" value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Banque Atlantique" required />
      <Liste libelle="Type" value={type} onChange={(e) => setType(e.target.value as TypeJournal)}>
        {(Object.keys(LIBELLES_TYPES_JOURNAUX) as TypeJournal[]).map((t) => (
          <option key={t} value={t}>{LIBELLES_TYPES_JOURNAUX[t]}</option>
        ))}
      </Liste>
      {tresorerie && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Compte de trésorerie</span>
          <ChoixCompte comptes={comptesClasse5} valeur={compteId} onChange={setCompteId} placeholder="Ex. : 5212" />
          <span className="text-xs text-muted">Créez d&apos;abord un sous-compte (ex. 5212) si besoin.</span>
        </div>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Bouton type="button" variante="secondaire" onClick={() => setOuvert(false)}>Annuler</Bouton>
        <Bouton type="submit" disabled={!code || libelle.trim().length < 2 || (tresorerie && !compteId)}>Créer</Bouton>
      </div>
    </form>
  );
}
