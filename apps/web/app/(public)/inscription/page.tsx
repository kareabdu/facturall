"use client";

import { traduireErreur, validerEmail, validerMotDePasse } from "@facturall/core";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Alerte, Bouton, Champ } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function Inscription() {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [aConfirmer, setAConfirmer] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const invalide =
      (nom.trim().length < 2 ? "Saisissez votre nom." : null) ?? validerEmail(email) ?? validerMotDePasse(motDePasse);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEnvoi(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: motDePasse,
      options: {
        data: { nom_complet: nom.trim() },
        emailRedirectTo: `${window.location.origin}/connexion`,
      },
    });
    setEnvoi(false);
    if (error) return setErreur(traduireErreur(error));
    // Sans session : la confirmation par e-mail est activée dans Supabase.
    if (!data.session) setAConfirmer(true);
  }

  if (aConfirmer) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-xl font-semibold">Vérifiez votre e-mail</h1>
        <p className="text-sm text-muted">
          Nous avons envoyé un lien de confirmation à <strong className="text-foreground">{email.trim()}</strong>.
          Cliquez dessus, puis connectez-vous.
        </p>
        <Link href="/connexion" className="text-sm font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">Créer un compte</h1>
        <p className="mt-1 text-sm text-muted">Vous créerez ensuite votre entreprise.</p>
      </div>
      {erreur && <Alerte>{erreur}</Alerte>}
      <Champ libelle="Nom complet" autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)} required />
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
        autoComplete="new-password"
        value={motDePasse}
        onChange={(e) => setMotDePasse(e.target.value)}
        aide="8 caractères minimum, avec lettres et chiffres."
        required
      />
      <Bouton type="submit" chargement={envoi}>
        Créer mon compte
      </Bouton>
      <p className="text-center text-sm text-muted">
        Déjà inscrit ?{" "}
        <Link href="/connexion" className="font-medium text-primary hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
