"use client";

import {
  aujourdhui,
  creerFournisseur,
  etatAchat,
  LIBELLES_ETATS_ACHAT,
  type DocumentAchat,
  type EtatAchat,
  type Fournisseur,
} from "@facturall/core";
import { useState } from "react";

import { Alerte, Badge, Bouton, Champ, Liste } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const TONS: Record<EtatAchat, "vert" | "gris" | "neutre" | "rouge"> = {
  brouillon: "gris",
  a_payer: "neutre",
  partiel: "neutre",
  paye: "vert",
  en_retard: "rouge",
  annulee: "gris",
};

export function BadgeEtatAchat({ document: d }: { document: DocumentAchat }) {
  if (d.type === "avoir") return <Badge ton="gris">Avoir</Badge>;
  const etat = etatAchat(d, aujourdhui());
  return <Badge ton={TONS[etat]}>{LIBELLES_ETATS_ACHAT[etat]}</Badge>;
}

/** Liste des fournisseurs actifs, avec création rapide (nom + téléphone). */
export function ChoixFournisseur({
  entrepriseId,
  fournisseurs,
  valeur,
  onChange,
  onCree,
}: {
  entrepriseId: string;
  fournisseurs: Fournisseur[];
  valeur: string;
  onChange: (id: string) => void;
  onCree: () => Promise<void> | void;
}) {
  const [creation, setCreation] = useState(fournisseurs.length === 0);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  if (!creation) {
    return (
      <div className="flex gap-2">
        <Liste aria-label="Fournisseur" className="flex-1" value={valeur} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Choisir —</option>
          {fournisseurs
            .filter((f) => f.actif || f.id === valeur)
            .map((f) => (
              <option key={f.id} value={f.id}>{f.nom} ({f.code})</option>
            ))}
        </Liste>
        <Bouton type="button" variante="secondaire" onClick={() => setCreation(true)}>+ Nouveau</Bouton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-background p-3">
      {erreur && <Alerte>{erreur}</Alerte>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Champ libelle="Nom du fournisseur" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
        <Champ libelle="Téléphone" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        {fournisseurs.length > 0 && (
          <Bouton type="button" variante="secondaire" className="h-9" onClick={() => setCreation(false)}>Annuler</Bouton>
        )}
        <Bouton
          type="button"
          className="h-9"
          chargement={envoi}
          disabled={nom.trim().length < 2}
          onClick={async () => {
            setEnvoi(true);
            setErreur(null);
            try {
              const f = await creerFournisseur(supabase, entrepriseId, { nom: nom.trim(), telephone: telephone.trim() || null });
              await onCree();
              onChange(f.id);
              setCreation(false);
              setNom("");
              setTelephone("");
            } catch (e) {
              setErreur((e as Error).message);
            }
            setEnvoi(false);
          }}
        >
          Créer le fournisseur
        </Bouton>
      </div>
    </div>
  );
}
