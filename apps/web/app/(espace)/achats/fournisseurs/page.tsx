"use client";

import {
  chargerSituationFournisseurs,
  creerFournisseur,
  libelleIdentifiantFiscal,
  modifierFournisseur,
  type Fournisseur,
  type SaisieFournisseur,
  type SituationFournisseur,
} from "@facturall/core";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Montant } from "@/components/compta";
import { Alerte, Badge, Bouton, Carte, Champ } from "@/components/ui";
import { useAchats } from "@/lib/achats";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

export default function PageFournisseurs() {
  const { entreprise } = useEspace();
  const { fournisseurs, peutAcheter, rafraichir } = useAchats();
  const [situations, setSituations] = useState<Map<string, SituationFournisseur>>(new Map());
  const [recherche, setRecherche] = useState("");
  const [inactifs, setInactifs] = useState(false);
  const [edition, setEdition] = useState<Fournisseur | "nouveau" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!entreprise) return;
    let actif = true;
    chargerSituationFournisseurs(supabase, entreprise.entreprise_id)
      .then((s) => actif && setSituations(new Map(s.map((x) => [x.fournisseur_id, x]))))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [entreprise, fournisseurs]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return fournisseurs.filter(
      (f) =>
        (inactifs || f.actif) &&
        (!q || f.nom.toLowerCase().includes(q) || f.code.toLowerCase().includes(q) || (f.telephone ?? "").includes(q)),
    );
  }, [fournisseurs, recherche, inactifs]);

  const totalDu = [...situations.values()].reduce((s, x) => s + x.reste_a_payer, 0);
  const totalEchu = [...situations.values()].reduce((s, x) => s + x.echu, 0);

  if (!entreprise) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Rechercher un fournisseur"
          placeholder="Nom, code ou téléphone…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="h-10 min-w-56 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary sm:max-w-80"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="accent-primary" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} />
          Afficher les fournisseurs désactivés
        </label>
        {peutAcheter && <Bouton className="ml-auto" onClick={() => setEdition("nouveau")}>Nouveau fournisseur</Bouton>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Dettes fournisseurs</p>
          <p className="montant mt-1 text-lg font-semibold"><Montant valeur={totalDu} /> FCFA</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Dont échues</p>
          <p className={`montant mt-1 text-lg font-semibold ${totalEchu ? "text-danger" : ""}`}><Montant valeur={totalEchu} /> FCFA</p>
        </div>
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}
      {message && <Alerte type="succes">{message}</Alerte>}

      {edition && (
        <FormulaireFournisseur
          fournisseur={edition === "nouveau" ? null : edition}
          pays={entreprise.pays}
          onAnnuler={() => setEdition(null)}
          onEnregistrer={async (champs) => {
            setErreur(null);
            try {
              if (edition === "nouveau") await creerFournisseur(supabase, entreprise.entreprise_id, champs);
              else await modifierFournisseur(supabase, edition.id, champs);
              await rafraichir();
              setMessage(edition === "nouveau" ? `Fournisseur « ${champs.nom} » créé.` : "Fournisseur mis à jour.");
              setEdition(null);
            } catch (e) {
              setErreur((e as Error).message);
            }
          }}
        />
      )}

      <Carte>
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Code</th>
                <th className="px-2 py-2.5 font-medium">Fournisseur</th>
                <th className="px-2 py-2.5 font-medium">Contact</th>
                <th className="px-2 py-2.5 text-right font-medium">Factures</th>
                <th className="px-2 py-2.5 text-right font-medium">Reste à payer</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtres.map((f) => {
                const s = situations.get(f.id);
                return (
                  <tr key={f.id} className={f.actif ? "" : "text-muted"}>
                    <td className="px-5 py-3 font-mono text-xs">{f.code}</td>
                    <td className="px-2 py-3">
                      <span className="font-medium">{f.nom}</span>
                      {!f.actif && <Badge ton="gris">Désactivé</Badge>}
                      {f.ville && <span className="block text-xs text-muted">{f.ville}</span>}
                    </td>
                    <td className="px-2 py-3 text-muted">{[f.telephone, f.email].filter(Boolean).join(" · ")}</td>
                    <td className="px-2 py-3 text-right">{s?.nb_factures ?? 0}</td>
                    <td className="px-2 py-3 text-right font-medium">
                      <Montant valeur={s?.reste_a_payer ?? 0} className={s?.echu ? "text-danger" : ""} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {peutAcheter && (
                        <span className="flex justify-end gap-1">
                          <button className="rounded px-2 py-1 text-xs text-muted hover:bg-background hover:text-foreground" onClick={() => setEdition(f)}>
                            Modifier
                          </button>
                          <button
                            className="rounded px-2 py-1 text-xs text-muted hover:bg-background hover:text-foreground"
                            onClick={async () => {
                              await modifierFournisseur(supabase, f.id, { actif: !f.actif }).catch((e: Error) => setErreur(e.message));
                              await rafraichir();
                            }}
                          >
                            {f.actif ? "Désactiver" : "Réactiver"}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtres.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-muted">Aucun fournisseur.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Carte>
    </div>
  );
}

function FormulaireFournisseur({
  fournisseur,
  pays,
  onAnnuler,
  onEnregistrer,
}: {
  fournisseur: Fournisseur | null;
  pays: string;
  onAnnuler: () => void;
  onEnregistrer: (f: SaisieFournisseur) => Promise<void>;
}) {
  const [f, setF] = useState<SaisieFournisseur>({
    nom: fournisseur?.nom ?? "",
    telephone: fournisseur?.telephone ?? "",
    email: fournisseur?.email ?? "",
    adresse: fournisseur?.adresse ?? "",
    ville: fournisseur?.ville ?? "",
    identifiant_fiscal: fournisseur?.identifiant_fiscal ?? "",
    rccm: fournisseur?.rccm ?? "",
    delai_paiement_jours: fournisseur?.delai_paiement_jours ?? null,
    notes: fournisseur?.notes ?? "",
  });
  const [envoi, setEnvoi] = useState(false);
  const maj = (champ: keyof SaisieFournisseur) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [champ]: e.target.value }));

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    const vide = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    await onEnregistrer({
      nom: f.nom.trim(),
      telephone: vide(f.telephone),
      email: vide(f.email)?.toLowerCase() ?? null,
      adresse: vide(f.adresse),
      ville: vide(f.ville),
      identifiant_fiscal: vide(f.identifiant_fiscal),
      rccm: vide(f.rccm),
      delai_paiement_jours: f.delai_paiement_jours ?? null,
      notes: vide(f.notes),
    });
    setEnvoi(false);
  }

  return (
    <Carte titre={fournisseur ? `Modifier ${fournisseur.nom}` : "Nouveau fournisseur"}>
      <form onSubmit={soumettre} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
        <Champ libelle="Nom / raison sociale" value={f.nom} onChange={maj("nom")} required className="lg:col-span-2" />
        <Champ libelle="Téléphone" type="tel" value={f.telephone ?? ""} onChange={maj("telephone")} />
        <Champ libelle="E-mail" type="email" value={f.email ?? ""} onChange={maj("email")} />
        <Champ libelle="Ville" value={f.ville ?? ""} onChange={maj("ville")} />
        <Champ
          libelle="Délai de paiement (jours)"
          inputMode="numeric"
          value={f.delai_paiement_jours ?? ""}
          onChange={(e) => setF((v) => ({ ...v, delai_paiement_jours: e.target.value ? Math.min(365, Number(e.target.value.replace(/\D/g, ""))) : null }))}
          aide="Vide = 30 jours"
        />
        <Champ libelle="Adresse" value={f.adresse ?? ""} onChange={maj("adresse")} className="lg:col-span-2" />
        <Champ libelle={libelleIdentifiantFiscal(pays)} value={f.identifiant_fiscal ?? ""} onChange={maj("identifiant_fiscal")} />
        <Champ libelle="N° RCCM" value={f.rccm ?? ""} onChange={maj("rccm")} />
        <Champ libelle="Notes internes" value={f.notes ?? ""} onChange={maj("notes")} className="lg:col-span-2" />
        <div className="flex justify-end gap-3 sm:col-span-2 lg:col-span-3">
          <Bouton type="button" variante="secondaire" onClick={onAnnuler}>Annuler</Bouton>
          <Bouton type="submit" chargement={envoi} disabled={f.nom.trim().length < 2}>Enregistrer</Bouton>
        </div>
      </form>
    </Carte>
  );
}
