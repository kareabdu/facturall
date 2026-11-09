"use client";

import { traduireErreur, validerEmail } from "@facturall/core";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Alerte, Bouton, Champ } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function Connexion() {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const invalide = validerEmail(email);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEnvoi(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
    setEnvoi(false);
    if (error) setErreur(traduireErreur(error));
    // En cas de succès, le layout redirige vers le tableau de bord.
  }

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">Connexion</h1>
        <p className="mt-1 text-sm text-muted">Accédez à vos entreprises et boutiques.</p>
      </div>
      {erreur && <Alerte>{erreur}</Alerte>}
      <Champ
        libelle="E-mail"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Champ
        libelle="Mot de passe"
        type="password"
        autoComplete="current-password"
        value={motDePasse}
        onChange={(e) => setMotDePasse(e.target.value)}
        required
      />
      <div className="-mt-2 text-right">
        <Link href="/mot-de-passe-oublie" className="text-sm text-primary hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>
      <Bouton type="submit" chargement={envoi}>
        Se connecter
      </Bouton>
      <p className="text-center text-sm text-muted">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="font-medium text-primary hover:underline">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}
