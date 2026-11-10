"use client";

import {
  chargerSituationClients,
  creerClient,
  libelleIdentifiantFiscal,
  modifierClient,
  type Client,
  type SaisieClient,
  type SituationClient,
} from "@facturall/core";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Montant } from "@/components/compta";
import { Alerte, Badge, Bouton, Carte, Champ, Liste } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";
import { useVentes } from "@/lib/ventes";

export default function PageClients() {
  const { entreprise } = useEspace();
  const { clients, peutVendre, rafraichir } = useVentes();
  const [situations, setSituations] = useState<Map<string, SituationClient>>(new Map());
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState<Client | "nouveau" | null>(null);
  const [inactifs, setInactifs] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!entreprise) return;
    let actif = true;
    chargerSituationClients(supabase, entreprise.entreprise_id)
      .then((s) => {
        if (actif) setSituations(new Map(s.map((x) => [x.client_id, x])));
      })
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [entreprise, clients]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return clients.filter(
      (c) =>
        (inactifs || c.actif) &&
        (!q || c.nom.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.telephone ?? "").includes(q)),
    );
  }, [clients, recherche, inactifs]);

  const totalDu = [...situations.values()].reduce((s, x) => s + x.reste_du, 0);
  const totalEchu = [...situations.values()].reduce((s, x) => s + x.echu, 0);

  if (!entreprise) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Rechercher un client"
          placeholder="Nom, code ou téléphone…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="h-10 min-w-56 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary sm:max-w-80"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="accent-primary" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} />
          Afficher les clients désactivés
        </label>
        {peutVendre && (
          <Bouton className="ml-auto" onClick={() => setEdition("nouveau")}>Nouveau client</Bouton>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-carte">
          <p className="text-sm text-muted">Créances clients</p>
          <p className="montant mt-1 text-lg font-semibold"><Montant valeur={totalDu} /> FCFA</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-carte">
          <p className="text-sm text-muted">Dont échues</p>
          <p className={`montant mt-1 text-lg font-semibold ${totalEchu ? "text-danger" : ""}`}><Montant valeur={totalEchu} /> FCFA</p>
        </div>
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}
      {message && <Alerte type="succes">{message}</Alerte>}

      {edition && (
        <FormulaireClient
          client={edition === "nouveau" ? null : edition}
          pays={entreprise.pays}
          onAnnuler={() => setEdition(null)}
          onEnregistrer={async (champs) => {
            setErreur(null);
            try {
              if (edition === "nouveau") await creerClient(supabase, entreprise.entreprise_id, champs);
              else await modifierClient(supabase, edition.id, champs);
              await rafraichir();
              setMessage(edition === "nouveau" ? `Client « ${champs.nom} » créé.` : "Client mis à jour.");
              setEdition(null);
            } catch (e) {
              setErreur((e as Error).message);
            }
          }}
        />
      )}

      <Carte>
        <div className="-mx-5 -my-5 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-border bg-surface-retrait text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2.5 font-medium">Code</th>
                <th className="px-2 py-2.5 font-medium">Client</th>
                <th className="px-2 py-2.5 font-medium">Contact</th>
                <th className="px-2 py-2.5 text-right font-medium">Factures</th>
                <th className="px-2 py-2.5 text-right font-medium">Reste dû</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtres.map((c) => {
                const s = situations.get(c.id);
                return (
                  <tr key={c.id} className={c.actif ? "" : "text-muted"}>
                    <td className="px-5 py-3 font-mono text-xs">{c.code}</td>
                    <td className="px-2 py-3">
                      <span className="font-medium">{c.nom}</span>
                      {!c.actif && <Badge ton="gris">Désactivé</Badge>}
                      {c.ville && <span className="block text-xs text-muted">{c.ville}</span>}
                    </td>
                    <td className="px-2 py-3 text-muted">{[c.telephone, c.email].filter(Boolean).join(" · ")}</td>
                    <td className="px-2 py-3 text-right">{s?.nb_factures ?? 0}</td>
                    <td className="px-2 py-3 text-right font-medium">
                      <Montant valeur={s?.reste_du ?? 0} className={s?.echu ? "text-danger" : ""} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {peutVendre && c.code !== "CL0000" && (
                        <span className="flex justify-end gap-1">
                          <button className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-retrait hover:text-foreground" onClick={() => setEdition(c)}>
                            Modifier
                          </button>
                          <button
                            className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-retrait hover:text-foreground"
                            onClick={async () => {
                              await modifierClient(supabase, c.id, { actif: !c.actif }).catch((e: Error) => setErreur(e.message));
                              await rafraichir();
                            }}
                          >
                            {c.actif ? "Désactiver" : "Réactiver"}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtres.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-muted">Aucun client.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Carte>
      <p className="text-xs text-muted">
        « Clients divers » (CL0000) sert aux ventes au comptoir sans client identifié. Les factures d&apos;un client se
        retrouvent dans <Link href="/ventes" className="text-primary hover:underline">Factures et devis</Link>.
      </p>
    </div>
  );
}

function FormulaireClient({
  client,
  pays,
  onAnnuler,
  onEnregistrer,
}: {
  client: Client | null;
  pays: string;
  onAnnuler: () => void;
  onEnregistrer: (c: SaisieClient) => Promise<void>;
}) {
  const [f, setF] = useState<SaisieClient>({
    nom: client?.nom ?? "",
    type: client?.type ?? "entreprise",
    telephone: client?.telephone ?? "",
    email: client?.email ?? "",
    adresse: client?.adresse ?? "",
    ville: client?.ville ?? "",
    identifiant_fiscal: client?.identifiant_fiscal ?? "",
    rccm: client?.rccm ?? "",
    delai_paiement_jours: client?.delai_paiement_jours ?? null,
    notes: client?.notes ?? "",
  });
  const [envoi, setEnvoi] = useState(false);
  const maj = (champ: keyof SaisieClient) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [champ]: e.target.value }));

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    const vide = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    await onEnregistrer({
      nom: f.nom.trim(),
      type: f.type,
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
    <Carte titre={client ? `Modifier ${client.nom}` : "Nouveau client"}>
      <form onSubmit={soumettre} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
        <Champ libelle="Nom / raison sociale" value={f.nom} onChange={maj("nom")} required className="lg:col-span-2" />
        <Liste libelle="Type" value={f.type} onChange={maj("type")}>
          <option value="entreprise">Entreprise</option>
          <option value="particulier">Particulier</option>
        </Liste>
        <Champ libelle="Téléphone" type="tel" value={f.telephone ?? ""} onChange={maj("telephone")} />
        <Champ libelle="E-mail" type="email" value={f.email ?? ""} onChange={maj("email")} />
        <Champ libelle="Ville" value={f.ville ?? ""} onChange={maj("ville")} />
        <Champ libelle="Adresse" value={f.adresse ?? ""} onChange={maj("adresse")} className="lg:col-span-2" />
        <Champ
          libelle="Délai de paiement (jours)"
          inputMode="numeric"
          value={f.delai_paiement_jours ?? ""}
          onChange={(e) => setF((v) => ({ ...v, delai_paiement_jours: e.target.value ? Math.min(365, Number(e.target.value.replace(/\D/g, ""))) : null }))}
          aide="Vide = délai par défaut de l'entreprise"
        />
        <Champ libelle={libelleIdentifiantFiscal(pays)} value={f.identifiant_fiscal ?? ""} onChange={maj("identifiant_fiscal")} />
        <Champ libelle="N° RCCM" value={f.rccm ?? ""} onChange={maj("rccm")} />
        <Champ libelle="Notes internes" value={f.notes ?? ""} onChange={maj("notes")} />
        <div className="flex justify-end gap-3 sm:col-span-2 lg:col-span-3">
          <Bouton type="button" variante="secondaire" onClick={onAnnuler}>Annuler</Bouton>
          <Bouton type="submit" chargement={envoi} disabled={f.nom.trim().length < 2}>Enregistrer</Bouton>
        </div>
      </form>
    </Carte>
  );
}
