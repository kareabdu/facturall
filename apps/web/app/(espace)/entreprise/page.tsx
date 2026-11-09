"use client";

import {
  chargerEntreprise,
  FORMES_JURIDIQUES,
  libelleIdentifiantFiscal,
  modifierEntreprise,
  nomPays,
  type Entreprise,
  type ModificationEntreprise,
} from "@facturall/core";
import { useEffect, useState, type FormEvent } from "react";

import { Alerte, Bouton, Carte, Champ, Chargement, EnTetePage, Liste } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

export default function PageEntreprise() {
  const { entreprise: active, admin, rafraichir } = useEspace();
  const id = active?.entreprise_id;
  const [e, setE] = useState<Entreprise | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!id) return;
    chargerEntreprise(supabase, id).then(setE, (err: Error) => setErreur(err.message));
  }, [id]);

  if (!e) return erreur ? <Alerte>{erreur}</Alerte> : <Chargement />;

  const maj = (champ: keyof ModificationEntreprise) => (ev: { target: { value: string } }) =>
    setE((v) => (v ? { ...v, [champ]: ev.target.value } : v));

  async function soumettre(ev: FormEvent) {
    ev.preventDefault();
    if (!e) return;
    if (e.raison_sociale.trim().length < 2) return setErreur("La raison sociale est obligatoire.");
    setErreur(null);
    setMessage(null);
    setEnvoi(true);
    const vide = (s: string | null) => (s?.trim() ? s.trim() : null);
    try {
      await modifierEntreprise(supabase, e.id, {
        raison_sociale: e.raison_sociale.trim(),
        sigle: vide(e.sigle),
        forme_juridique: vide(e.forme_juridique),
        ville: vide(e.ville),
        adresse: vide(e.adresse),
        telephone: vide(e.telephone),
        email: vide(e.email)?.toLowerCase() ?? null,
        rccm: vide(e.rccm),
        identifiant_fiscal: vide(e.identifiant_fiscal),
        mode_comptable: e.mode_comptable,
        systeme_comptable: e.systeme_comptable,
      });
      await rafraichir();
      setMessage("Modifications enregistrées.");
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} noValidate>
      <EnTetePage
        titre="Entreprise"
        description={admin ? "Ces informations figureront sur vos factures." : "Seuls les administrateurs peuvent modifier ces informations."}
        action={admin && <Bouton type="submit" chargement={envoi}>Enregistrer</Bouton>}
      />
      <div className="flex flex-col gap-6">
        {erreur && <Alerte>{erreur}</Alerte>}
        {message && <Alerte type="succes">{message}</Alerte>}

        <fieldset disabled={!admin} className="flex flex-col gap-6">
          <Carte titre="Identité">
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ libelle="Raison sociale" className="sm:col-span-2" value={e.raison_sociale} onChange={maj("raison_sociale")} required />
              <Liste libelle="Forme juridique" value={e.forme_juridique ?? ""} onChange={maj("forme_juridique")}>
                <option value="">—</option>
                {FORMES_JURIDIQUES.map((f) => (
                  <option key={f.code} value={f.code}>{f.libelle}</option>
                ))}
              </Liste>
              <Champ libelle="Sigle / nom commercial" value={e.sigle ?? ""} onChange={maj("sigle")} />
              <Champ libelle="Pays" value={nomPays(e.pays)} disabled aide="Le pays ne peut pas être changé (référentiel fiscal)." />
              <Champ libelle="Ville" value={e.ville ?? ""} onChange={maj("ville")} />
              <Champ libelle="Adresse" className="sm:col-span-2" value={e.adresse ?? ""} onChange={maj("adresse")} />
              <Champ libelle="Téléphone" type="tel" value={e.telephone ?? ""} onChange={maj("telephone")} />
              <Champ libelle="E-mail" type="email" value={e.email ?? ""} onChange={maj("email")} />
            </div>
          </Carte>

          <Carte titre="Immatriculation">
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ libelle="N° RCCM" value={e.rccm ?? ""} onChange={maj("rccm")} />
              <Champ libelle={libelleIdentifiantFiscal(e.pays)} value={e.identifiant_fiscal ?? ""} onChange={maj("identifiant_fiscal")} />
            </div>
          </Carte>

          <Carte titre="Comptabilité">
            <div className="grid gap-4 sm:grid-cols-2">
              <Liste libelle="Mode de saisie" value={e.mode_comptable} onChange={maj("mode_comptable")}>
                <option value="simplifie">Simplifié — recettes et dépenses</option>
                <option value="avance">Avancé — écritures en partie double</option>
              </Liste>
              <Liste libelle="Système SYSCOHADA" value={e.systeme_comptable} onChange={maj("systeme_comptable")}>
                <option value="normal">Système normal</option>
                <option value="smt">Système minimal de trésorerie (SMT)</option>
              </Liste>
              <p className="text-xs text-muted sm:col-span-2">
                Les deux modes alimentent la même comptabilité : vous pouvez passer du simplifié à l&apos;avancé à tout moment
                sans perdre de données. Le SMT est réservé aux très petites entités selon les seuils de chiffre d&apos;affaires
                fixés par l&apos;Acte uniforme ; vérifiez votre éligibilité avec votre expert-comptable.
              </p>
            </div>
          </Carte>
        </fieldset>
      </div>
    </form>
  );
}
