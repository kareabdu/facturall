"use client";

import {
  annulerInvitation,
  chargerInvitations,
  chargerMembres,
  DESCRIPTIONS_ROLES,
  inviterMembre,
  LIBELLES_ROLES,
  modifierMembre,
  retirerMembre,
  rolesAttribuables,
  validerEmail,
  type Boutique,
  type Invitation,
  type MembreDetail,
  type Role,
} from "@facturall/core";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Alerte, Badge, Bouton, Carte, Champ, Chargement, EnTetePage, Liste } from "@/components/ui";
import { useEspace } from "@/lib/espace";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

export default function PageMembres() {
  const { session } = useSession();
  const { entreprise, boutiques, admin, role, rafraichir } = useEspace();
  const entrepriseId = entreprise?.entreprise_id;
  const [membres, setMembres] = useState<MembreDetail[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!entrepriseId) return;
    try {
      const [m, i] = await Promise.all([
        chargerMembres(supabase, entrepriseId),
        admin ? chargerInvitations(supabase, entrepriseId) : Promise.resolve([]),
      ]);
      setMembres(m);
      setInvitations(i);
    } catch (e) {
      setErreur((e as Error).message);
    }
  }, [entrepriseId, admin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  async function action(fn: () => Promise<void>, succes?: string) {
    setErreur(null);
    setMessage(null);
    try {
      await fn();
      if (succes) setMessage(succes);
      await charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  if (!entreprise) return null;
  const attribuables = rolesAttribuables(role);

  return (
    <>
      <EnTetePage titre="Membres" description="Qui a accès à cette entreprise, avec quel rôle et sur quelles boutiques." />

      <div className="mb-4 flex flex-col gap-2">
        {erreur && <Alerte>{erreur}</Alerte>}
        {message && <Alerte type="succes">{message}</Alerte>}
      </div>

      {admin && (
        <FormulaireInvitation
          boutiques={boutiques}
          roles={attribuables}
          onInviter={(email, r, toutes, ids) =>
            action(
              () => inviterMembre(supabase, entreprise.entreprise_id, email, r, toutes, ids),
              `Invitation enregistrée. ${email} rejoindra l'entreprise en se connectant (ou en créant son compte) avec cette adresse.`,
            )
          }
        />
      )}

      <Carte titre="Membres actuels" className="mb-6">
        {!membres ? (
          <Chargement />
        ) : (
          <ul className="-my-2 divide-y divide-border">
            {membres.map((m) => (
              <LigneMembre
                key={m.membre_id}
                membre={m}
                estMoi={m.user_id === session?.user.id}
                admin={admin}
                rolesPossibles={attribuables}
                boutiques={boutiques}
                onModifier={(r, toutes, ids) => action(() => modifierMembre(supabase, m.membre_id, r, toutes, ids), "Membre mis à jour.")}
                onRetirer={() => {
                  const moi = m.user_id === session?.user.id;
                  const question = moi
                    ? `Quitter ${entreprise.raison_sociale} ? Vous n'y aurez plus accès.`
                    : `Retirer ${m.nom_complet ?? m.email} de l'entreprise ?`;
                  if (!confirm(question)) return;
                  if (moi) {
                    retirerMembre(supabase, m.membre_id).then(rafraichir, (e: Error) => setErreur(e.message));
                  } else {
                    void action(() => retirerMembre(supabase, m.membre_id), "Membre retiré.");
                  }
                }}
              />
            ))}
          </ul>
        )}
      </Carte>

      {admin && invitations.length > 0 && (
        <Carte titre="Invitations en attente">
          <ul className="-my-2 divide-y divide-border">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{i.email}</span>
                <Badge>{LIBELLES_ROLES[i.role]}</Badge>
                <span className="text-muted">
                  {new Date(i.expire_le) < new Date()
                    ? "expirée"
                    : `expire le ${new Date(i.expire_le).toLocaleDateString("fr-FR")}`}
                </span>
                <Bouton variante="discret" className="h-8 px-3" onClick={() => void action(() => annulerInvitation(supabase, i.id))}>
                  Annuler
                </Bouton>
              </li>
            ))}
          </ul>
        </Carte>
      )}
    </>
  );
}

function ChoixBoutiques({
  boutiques,
  toutes,
  selection,
  onChange,
}: {
  boutiques: Boutique[];
  toutes: boolean;
  selection: string[];
  onChange: (toutes: boolean, selection: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2 text-sm">
      <legend className="mb-1.5 font-medium">Accès aux boutiques</legend>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={toutes} onChange={(e) => onChange(e.target.checked, selection)} className="accent-primary" />
        Toutes les boutiques
      </label>
      {!toutes && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 pl-6">
          {boutiques.filter((b) => b.active).map((b) => (
            <label key={b.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-primary"
                checked={selection.includes(b.id)}
                onChange={(e) =>
                  onChange(false, e.target.checked ? [...selection, b.id] : selection.filter((id) => id !== b.id))
                }
              />
              {b.nom}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function FormulaireInvitation({
  boutiques,
  roles,
  onInviter,
}: {
  boutiques: Boutique[];
  roles: Role[];
  onInviter: (email: string, role: Role, toutes: boolean, ids: string[]) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("vendeur");
  const [toutes, setToutes] = useState(true);
  const [selection, setSelection] = useState<string[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: FormEvent) {
    e.preventDefault();
    const invalide = validerEmail(email) ?? (!toutes && selection.length === 0 ? "Choisissez au moins une boutique." : null);
    if (invalide) return setErreur(invalide);
    setErreur(null);
    setEnvoi(true);
    await onInviter(email.trim().toLowerCase(), role, toutes, selection);
    setEnvoi(false);
    setEmail("");
  }

  return (
    <Carte titre="Inviter un membre" className="mb-6">
      <form onSubmit={soumettre} className="flex flex-col gap-4" noValidate>
        {erreur && <Alerte>{erreur}</Alerte>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="flex flex-col gap-1.5">
            <Liste libelle="Rôle" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {LIBELLES_ROLES[r]}
                </option>
              ))}
            </Liste>
            <span className="text-xs text-muted">{DESCRIPTIONS_ROLES[role]}</span>
          </div>
        </div>
        <ChoixBoutiques
          boutiques={boutiques}
          toutes={toutes}
          selection={selection}
          onChange={(t, s) => {
            setToutes(t);
            setSelection(s);
          }}
        />
        <div className="flex justify-end">
          <Bouton type="submit" chargement={envoi}>
            Inviter
          </Bouton>
        </div>
      </form>
    </Carte>
  );
}

function LigneMembre({
  membre,
  estMoi,
  admin,
  rolesPossibles,
  boutiques,
  onModifier,
  onRetirer,
}: {
  membre: MembreDetail;
  estMoi: boolean;
  admin: boolean;
  rolesPossibles: Role[];
  boutiques: Boutique[];
  onModifier: (role: Role, toutes: boolean, ids: string[]) => Promise<void>;
  onRetirer: () => void;
}) {
  const [edition, setEdition] = useState(false);
  const [role, setRole] = useState<Role>(membre.role);
  const [toutes, setToutes] = useState(membre.toutes_boutiques);
  const [selection, setSelection] = useState<string[]>(membre.boutique_ids);
  // Un admin ne peut pas modifier un propriétaire
  const modifiable = admin && rolesPossibles.includes(membre.role);
  const nomsBoutiques = boutiques.filter((b) => membre.boutique_ids.includes(b.id)).map((b) => b.nom);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {membre.nom_complet ?? membre.email}
            {estMoi && <span className="ml-2 text-xs font-normal text-muted">(vous)</span>}
          </p>
          <p className="text-sm text-muted">
            {membre.email} · {membre.toutes_boutiques ? "toutes les boutiques" : nomsBoutiques.join(", ") || "aucune boutique"}
          </p>
        </div>
        <Badge ton={membre.role === "proprietaire" ? "vert" : "neutre"}>{LIBELLES_ROLES[membre.role]}</Badge>
        {modifiable && !edition && (
          <Bouton variante="discret" className="h-8 px-3" onClick={() => setEdition(true)}>
            Modifier
          </Bouton>
        )}
        {(modifiable || estMoi) && !edition && (
          <Bouton variante="discret" className="h-8 px-3 text-danger! hover:bg-danger-soft!" onClick={onRetirer}>
            {estMoi ? "Quitter" : "Retirer"}
          </Bouton>
        )}
      </div>
      {edition && (
        <div className="mt-3 flex flex-col gap-4 rounded-lg bg-background p-4">
          <Liste libelle="Rôle" value={role} onChange={(e) => setRole(e.target.value as Role)} className="max-w-xs">
            {rolesPossibles.map((r) => (
              <option key={r} value={r}>
                {LIBELLES_ROLES[r]}
              </option>
            ))}
          </Liste>
          <ChoixBoutiques
            boutiques={boutiques}
            toutes={toutes}
            selection={selection}
            onChange={(t, s) => {
              setToutes(t);
              setSelection(s);
            }}
          />
          <div className="flex justify-end gap-3">
            <Bouton variante="secondaire" onClick={() => setEdition(false)}>
              Annuler
            </Bouton>
            <Bouton
              onClick={async () => {
                await onModifier(role, toutes, selection);
                setEdition(false);
              }}
            >
              Enregistrer
            </Bouton>
          </div>
        </div>
      )}
    </li>
  );
}
