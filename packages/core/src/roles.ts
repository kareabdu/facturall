/**
 * Rôles d'un membre dans une entreprise.
 * Doit rester synchronisé avec l'enum `public.role_membre` de la migration.
 */
export const ROLES = [
  "proprietaire",
  "admin",
  "comptable",
  "gestionnaire",
  "vendeur",
  "lecteur",
] as const;

export type Role = (typeof ROLES)[number];

export const LIBELLES_ROLES: Record<Role, string> = {
  proprietaire: "Propriétaire",
  admin: "Administrateur",
  comptable: "Comptable",
  gestionnaire: "Gestionnaire de boutique",
  vendeur: "Vendeur",
  lecteur: "Lecture seule",
};

export const DESCRIPTIONS_ROLES: Record<Role, string> = {
  proprietaire: "Tous les droits, y compris la gestion des propriétaires.",
  admin: "Gère l'entreprise, les boutiques et les membres.",
  comptable: "Accès complet à la comptabilité et aux états financiers.",
  gestionnaire: "Gère les ventes, achats et stocks de ses boutiques.",
  vendeur: "Crée des ventes et encaisse dans ses boutiques.",
  lecteur: "Consulte sans rien modifier.",
};

/** Rôles autorisés à gérer l'entreprise, ses boutiques et ses membres. */
export const ROLES_ADMIN: readonly Role[] = ["proprietaire", "admin"];

export function estAdmin(role: Role | null | undefined): boolean {
  return role != null && ROLES_ADMIN.includes(role);
}

/** Un propriétaire peut attribuer tous les rôles ; un admin tous sauf propriétaire. */
export function rolesAttribuables(role: Role | null | undefined): Role[] {
  if (role === "proprietaire") return [...ROLES];
  if (role === "admin") return ROLES.filter((r) => r !== "proprietaire");
  return [];
}

// Vérification à la compilation : la liste ROLES doit correspondre à l'enum de la base.
import type { Database } from "./database.types";
type _RolesBase = Database["public"]["Enums"]["role_membre"];
const _rolesSynchronises: [_RolesBase] extends [Role] ? ([Role] extends [_RolesBase] ? true : never) : never = true;
void _rolesSynchronises;
