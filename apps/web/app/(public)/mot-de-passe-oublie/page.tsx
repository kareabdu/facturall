"use client";

import { traduireErreur, validerEmail } from "@facturall/core";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Alerte, Bouton, Champ } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function MotDePasseOublie() {
  const [email, setEmail] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const invalide = validerEmail(email);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEnvoi(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
    });
    setEnvoi(false);
    if (error) return setErreur(traduireErreur(error));
    setEnvoye(true);
  }

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">Mot de passe oublié</h1>
        <p className="mt-1 text-sm text-muted">Recevez un lien pour choisir un nouveau mot de passe.</p>
      </div>
      {erreur && <Alerte>{erreur}</Alerte>}
      {envoye ? (
        <Alerte type="succes">Si un compte existe pour cet e-mail, un lien vient de vous être envoyé.</Alerte>
      ) : (
        <>
          <Champ
            libelle="E-mail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Bouton type="submit" chargement={envoi}>
            Envoyer le lien
          </Bouton>
        </>
      )}
      <Link href="/connexion" className="text-center text-sm font-medium text-primary hover:underline">
        Retour à la connexion
      </Link>
    </form>
  );
}
