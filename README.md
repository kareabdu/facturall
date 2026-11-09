# FacturAll

Gestion commerciale et comptabilité SYSCOHADA révisé, en FCFA (XOF), multi-entreprises et multi-boutiques.
Web (Next.js), Android et iOS (Expo), backend Supabase.

## Structure

```
apps/
  web/        Next.js 16 — application web
  mobile/     Expo 58 — Android / iOS
packages/
  core/       Code partagé : types, règles FCFA, rôles, accès aux données,
              fournisseurs React (session, entreprise/boutique active)
supabase/
  migrations/ Schéma SQL (tables, RLS, fonctions)
  tests/      Tests de sécurité de la base (Postgres en mémoire)
```

## Installation

```bash
pnpm install
```

Variables d'environnement (non versionnées) :

- `apps/web/.env.local` : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `apps/mobile/.env` : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## Base de données

Appliquer les migrations sur le projet Supabase, au choix :

- **CLI** (recommandé) :
  ```bash
  npx supabase@latest init        # une seule fois : crée supabase/config.toml
  npx supabase@latest login
  npx supabase@latest link --project-ref <ref-du-projet>
  pnpm db:push
  ```
- **Tableau de bord** : SQL Editor → coller le contenu de chaque fichier de `supabase/migrations/`, dans l'ordre.

Dans Supabase → Authentication → URL Configuration, ajouter `http://localhost:3000/**`
(et l'URL de production) aux « Redirect URLs » pour la confirmation d'e-mail et le mot de passe oublié.

Tester la sécurité (RLS, rôles, invitations) sans toucher à Supabase :

```bash
pnpm test:db
```

## Lancer

```bash
pnpm dev:web       # http://localhost:3000
pnpm dev:mobile    # Expo (Android / iOS / web)
pnpm typecheck     # vérification TypeScript de tout le monorepo
```

## Modèle de données (socle)

| Table | Rôle |
|---|---|
| `profils` | 1 par utilisateur (nom, e-mail), créé automatiquement à l'inscription |
| `entreprises` | Entité juridique, pays UEMOA, devise XOF, mode comptable simplifié/avancé |
| `boutiques` | Points de vente d'une entreprise ; une boutique principale ; désactivables, jamais supprimées |
| `membres` | Rôle d'un utilisateur dans une entreprise : propriétaire, admin, comptable, gestionnaire, vendeur, lecteur |
| `membres_boutiques` | Boutiques autorisées quand un membre n'a pas accès à toutes |
| `invitations` | Invitation par e-mail, acceptée automatiquement à la connexion (e-mail confirmé) |

Règles appliquées par la base (pas seulement par l'interface) :

- chaque utilisateur ne voit que les entreprises dont il est membre (RLS) ;
- un vendeur ou gestionnaire limité ne voit que ses boutiques ;
- seuls propriétaires et admins gèrent boutiques, membres et invitations ;
- seul un propriétaire peut nommer ou retirer un propriétaire, et il en reste toujours au moins un ;
- pas de suppression d'entreprise ni de boutique via l'API (conservation des données comptables).

## Comptabilité (SYSCOHADA révisé)

À la création d'une entreprise, la base crée automatiquement :

- le **plan de base** (≈ 230 comptes principaux du SYSCOHADA révisé, classes 1 à 8), que le comptable complète
  par des sous-comptes (ex. 4111 sous 411) ;
- **7 journaux** : AC Achats, VT Ventes, BQ Banque (521), CA Caisse (571), MM Mobile Money (552),
  OD Opérations diverses, AN À-nouveaux ;
- l'**exercice** de l'année civile en cours.

Deux façons de saisir, qui alimentent la même comptabilité :

- **mode simplifié** (« Recette / dépense », web et mobile) : montant, caisse/banque/Mobile Money, catégorie ;
  l'écriture en partie double est générée et validée automatiquement ;
- **mode avancé** (« Saisie avancée ») : écriture libre en débit/crédit, brouillon puis validation.

Garanties assurées par la base :

| Règle | Comment |
|---|---|
| Écriture équilibrée | refus de validation si Σ débit ≠ Σ crédit (au moins 2 lignes) |
| Montants entiers FCFA | colonnes `bigint`, une ligne = débit **ou** crédit |
| Inaltérabilité | une écriture validée ne peut être ni modifiée ni supprimée : on la **contre-passe** |
| Numérotation continue | `CA-2026-00001`, par journal et par exercice, attribuée à la validation, sans trou |
| Exercice ouvert | date obligatoirement dans un exercice ouvert de l'entreprise |
| Droits | saisie : propriétaire, admin, comptable — lecture : + lecteur — vendeurs et gestionnaires : aucun accès aux écritures |

États disponibles : **balance générale** (avec export CSV pour Excel) et **grand livre** par compte.

> Le plan de base reprend les comptes principaux du SYSCOHADA révisé ; faites valider les intitulés et
> les sous-comptes (notamment 55x monnaie électronique) par votre expert-comptable.

## Conventions

- Montants en **entiers XOF** (pas de centimes) : `formaterXOF`, `lireMontantXOF`, `arrondirXOF` dans `@facturall/core`.
- Code et interface en français.
