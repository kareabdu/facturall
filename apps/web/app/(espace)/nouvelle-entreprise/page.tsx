"use client";

import {
  creerEntreprise,
  FORMES_JURIDIQUES,
  libelleIdentifiantFiscal,
  PAYS_UEMOA,
  validerNouvelleEntreprise,
  type NouvelleEntreprise,
} from "@facturall/core";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alerte, Bouton, Carte, Champ, Liste } from "@/components/ui";
import { memoriserEntreprise, useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

const VIDE: NouvelleEntreprise = {
  raison_sociale: "",
  pays: "SN",
  forme_juridique: "SARL",
  sigle: "",
  ville: "",
  telephone: "",
  email: "",
  rccm: "",
  identifiant_fiscal: "",
  nom_boutique: "",
};

export default function PageNouvelleEntreprise() {
  const { entreprises, rafraichir } = useEspace();
  const router = useRouter();
  const [f, setF] = useState<NouvelleEntreprise>(VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const premiere = entreprises.length === 0;

  const maj = (champ: keyof NouvelleEntreprise) => (e: { target: { value: string } }) =>
    setF((v) => ({ ...v, [champ]: e.target.value }));

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const invalide = validerNouvelleEntreprise(f);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEnvoi(true);
    try {
      const id = await creerEntreprise(supabase, f);
      memoriserEntreprise(id);
      await rafraichir();
      router.replace("/tableau-de-bord");
    } catch (err) {
      setErreur((err as Error).message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-6" noValidate>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {premiere ? "Bienvenue ! Créons votre entreprise" : "Nouvelle entreprise"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Chaque entreprise a sa propre comptabilité SYSCOHADA en FCFA. Vous pourrez compléter ces informations plus tard.
        </p>
      </div>

      {erreur && <Alerte>{erreur}</Alerte>}

      <Carte titre="Identité">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            libelle="Raison sociale"
            className="sm:col-span-2"
            value={f.raison_sociale}
            onChange={maj("raison_sociale")}
            placeholder="Ex. : Diop Commerce SARL"
            required
          />
          <Liste libelle="Forme juridique" value={f.forme_juridique ?? ""} onChange={maj("forme_juridique")}>
            {FORMES_JURIDIQUES.map((fj) => (
              <option key={fj.code} value={fj.code}>
                {fj.libelle}
              </option>
            ))}
          </Liste>
          <Champ libelle="Sigle / nom commercial" value={f.sigle ?? ""} onChange={maj("sigle")} />
          <Liste libelle="Pays" value={f.pays} onChange={maj("pays")} required>
            {PAYS_UEMOA.map((p) => (
              <option key={p.code} value={p.code}>
                {p.nom}
              </option>
            ))}
          </Liste>
          <Champ libelle="Ville" value={f.ville ?? ""} onChange={maj("ville")} />
          <Champ libelle="Téléphone" type="tel" value={f.telephone ?? ""} onChange={maj("telephone")} />
          <Champ libelle="E-mail de l'entreprise" type="email" value={f.email ?? ""} onChange={maj("email")} />
        </div>
      </Carte>

      <Carte titre="Immatriculation (facultatif)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="N° RCCM" value={f.rccm ?? ""} onChange={maj("rccm")} />
          <Champ
            libelle={libelleIdentifiantFiscal(f.pays)}
            value={f.identifiant_fiscal ?? ""}
            onChange={maj("identifiant_fiscal")}
          />
        </div>
      </Carte>

      <Carte titre="Première boutique">
        <Champ
          libelle="Nom de la boutique"
          value={f.nom_boutique ?? ""}
          onChange={maj("nom_boutique")}
          placeholder="Boutique principale"
          aide="Vous pourrez ajouter d'autres boutiques ensuite."
        />
      </Carte>

      <div className="flex justify-end gap-3">
        {!premiere && (
          <Bouton type="button" variante="secondaire" onClick={() => router.back()}>
            Annuler
          </Bouton>
        )}
        <Bouton type="submit" chargement={envoi}>
          Créer l&apos;entreprise
        </Bouton>
      </div>
    </form>
  );
}
