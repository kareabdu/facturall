"use client";

import { traduireErreur, validerMotDePasse } from "@facturall/core";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alerte, Bouton, Champ, Chargement, Logo } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/** Page ouverte depuis le lien « mot de passe oublié » reçu par e-mail. */
export default function NouveauMotDePasse() {
  const { session, chargement } = useSession();
  const router = useRouter();
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const invalide = validerMotDePasse(motDePasse);
    if (invalide) return setErreur(invalide);
    setEnvoi(true);
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    setEnvoi(false);
    if (error) return setErreur(traduireErreur(error));
    router.replace("/tableau-de-bord");
  }

  if (chargement) return <Chargement />;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Logo className="mb-8" />
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        {!session ? (
          <div className="flex flex-col gap-4 text-center">
            <Alerte>Ce lien a expiré ou a déjà été utilisé.</Alerte>
            <Bouton variante="secondaire" onClick={() => router.replace("/mot-de-passe-oublie")}>
              Demander un nouveau lien
            </Bouton>
          </div>
        ) : (
          <form onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
            <h1 className="text-xl font-semibold">Nouveau mot de passe</h1>
            {erreur && <Alerte>{erreur}</Alerte>}
            <Champ
              libelle="Nouveau mot de passe"
              type="password"
              autoComplete="new-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              aide="8 caractères minimum, avec lettres et chiffres."
              required
            />
            <Bouton type="submit" chargement={envoi}>
              Enregistrer
            </Bouton>
          </form>
        )}
      </div>
    </div>
  );
}
