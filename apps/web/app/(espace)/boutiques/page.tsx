"use client";

import {
  creerBoutique,
  modifierBoutique,
  normaliserCodeBoutique,
  validerCodeBoutique,
  type Boutique,
} from "@facturall/core";
import { useState, type FormEvent } from "react";

import { Alerte, Badge, Bouton, Carte, Champ, EnTetePage } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { supabase } from "@/lib/supabase";

export default function PageBoutiques() {
  const { entreprise, boutiques, admin, rafraichir } = useEspace();
  const [formulaire, setFormulaire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculer(b: Boutique) {
    setErreur(null);
    try {
      await modifierBoutique(supabase, b.id, { active: !b.active });
      await rafraichir();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  if (!entreprise) return null;

  return (
    <>
      <EnTetePage
        titre="Boutiques"
        description="Chaque boutique a ses ventes, sa caisse et son stock. La comptabilité reste au niveau de l'entreprise."
        action={admin && !formulaire && <Bouton onClick={() => setFormulaire(true)}>Ajouter une boutique</Bouton>}
      />

      {erreur && <div className="mb-4"><Alerte>{erreur}</Alerte></div>}

      {formulaire && (
        <FormulaireBoutique
          entrepriseId={entreprise.entreprise_id}
          onFini={async (ok) => {
            setFormulaire(false);
            if (ok) await rafraichir();
          }}
        />
      )}

      <Carte>
        <ul className="-my-2 divide-y divide-border">
          {boutiques.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="w-20 shrink-0 font-mono text-xs text-muted">{b.code}</span>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${b.active ? "" : "text-muted line-through"}`}>{b.nom}</p>
                {(b.ville || b.adresse) && (
                  <p className="text-sm text-muted">{[b.adresse, b.ville].filter(Boolean).join(", ")}</p>
                )}
              </div>
              {b.est_principale && <Badge ton="vert">Principale</Badge>}
              {!b.active && <Badge ton="gris">Désactivée</Badge>}
              {admin && !b.est_principale && (
                <Bouton variante="discret" className="h-8 px-3" onClick={() => void basculer(b)}>
                  {b.active ? "Désactiver" : "Réactiver"}
                </Bouton>
              )}
            </li>
          ))}
          {boutiques.length === 0 && <li className="py-3 text-sm text-muted">Aucune boutique accessible.</li>}
        </ul>
      </Carte>

      <p className="mt-3 text-xs text-muted">
        Une boutique n&apos;est jamais supprimée : ses ventes et écritures doivent rester consultables. Désactivez-la plutôt.
      </p>
    </>
  );
}

function FormulaireBoutique({ entrepriseId, onFini }: { entrepriseId: string; onFini: (ok: boolean) => void }) {
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [codeTouche, setCodeTouche] = useState(false);
  const [ville, setVille] = useState("");
  const [adresse, setAdresse] = useState("");
  const [telephone, setTelephone] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const codeEffectif = codeTouche ? code : normaliserCodeBoutique(nom.split(/\s+/).pop() ?? "");

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const invalide = (nom.trim().length < 2 ? "Saisissez le nom de la boutique." : null) ?? validerCodeBoutique(codeEffectif);
    if (invalide) return setErreur(invalide);
    setEnvoi(true);
    try {
      await creerBoutique(supabase, entrepriseId, {
        nom: nom.trim(),
        code: codeEffectif,
        ville: ville.trim() || null,
        adresse: adresse.trim() || null,
        telephone: telephone.trim() || null,
      });
      onFini(true);
    } catch (err) {
      setErreur((err as Error).message);
      setEnvoi(false);
    }
  }

  return (
    <Carte titre="Nouvelle boutique" className="mb-6">
      <form onSubmit={soumettre} className="grid gap-4 sm:grid-cols-2" noValidate>
        {erreur && <div className="sm:col-span-2"><Alerte>{erreur}</Alerte></div>}
        <Champ libelle="Nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : Boutique Plateau" required />
        <Champ
          libelle="Code"
          value={codeEffectif}
          onChange={(e) => {
            setCodeTouche(true);
            setCode(normaliserCodeBoutique(e.target.value));
          }}
          aide="Court et unique : il apparaîtra dans la numérotation des documents."
          required
        />
        <Champ libelle="Ville" value={ville} onChange={(e) => setVille(e.target.value)} />
        <Champ libelle="Téléphone" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
        <Champ libelle="Adresse" className="sm:col-span-2" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
        <div className="flex justify-end gap-3 sm:col-span-2">
          <Bouton type="button" variante="secondaire" onClick={() => onFini(false)}>
            Annuler
          </Bouton>
          <Bouton type="submit" chargement={envoi}>
            Ajouter
          </Bouton>
        </div>
      </form>
    </Carte>
  );
}
