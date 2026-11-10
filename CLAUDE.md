# FacturAll — instructions pour Claude Code

Application de **gestion commerciale + comptabilité SYSCOHADA révisé**, en **FCFA (XOF)**, multi-entreprises et
multi-boutiques, pour l'Afrique de l'Ouest (UEMOA). Web (Next.js), Android et iOS (Expo), base Supabase.

Tout est en **français** : code (noms de variables, fonctions, tables), interface, messages d'erreur, commits.

## Environnement du développeur

- Windows, PowerShell. Si `pnpm` est refusé (politique d'exécution), utiliser `pnpm.cmd` / `npx.cmd`.
- Projet dans `C:\dev\facturall-propre`. Dépôt : https://github.com/kareabdu/facturall, branche `main`.
- **Pousser directement sur `main`** (pas de pull request), après vérifications.
- Supabase : projet « facturall », id `zbnjiohihyxsmthtwver`. Variables dans `apps/web/.env.local`
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) et `apps/mobile/.env` (`EXPO_PUBLIC_…`).
  Ces fichiers ne sont pas versionnés.

## Commandes

```
pnpm install
pnpm dev:web          # http://localhost:3000
pnpm dev:mobile       # Expo
pnpm typecheck        # tsc sur core, web et mobile
pnpm test:db          # tests SQL (PGlite, sans Supabase) — doivent tous passer
pnpm build:web
pnpm --dir apps/web lint
pnpm db:push          # applique les migrations sur Supabase (npx supabase login + link au préalable)
pnpm db:types         # régénère packages/core/src/database.types.ts
```

Avant chaque commit : `pnpm typecheck`, lint web, `pnpm test:db`, et `pnpm build:web` si l'interface web a changé.

## Structure

- `packages/core` (`@facturall/core`) : types, règles métier et accès aux données **partagés web/mobile**
  (`xof`, `roles`, `entreprises`, `comptabilite`, `ventes`, `achats`, `lettres`), fournisseurs React dans
  `@facturall/core/react`. Toute logique réutilisable va ici, pas dans les apps.
- `apps/web` : Next.js 16 (App Router, `cacheComponents`, Tailwind 4). Pages sous `app/(espace)/…`, composants UI
  dans `components/ui.tsx`, contextes de module dans `lib/` (`espace`, `ventes`, `achats`).
  ⚠️ Next.js 16 diffère des versions connues : lire `node_modules/next/dist/docs/` avant d'utiliser une API.
- `apps/mobile` : Expo 58, expo-router (`Stack.Protected`, `NativeTabs`), onglets accueil / caisse / réglages.
- `supabase/migrations` : schéma SQL. `supabase/tests` : tests PGlite (`outils.mjs` imite l'environnement Supabase).

## Règles de la base (à respecter dans toute nouvelle migration)

- **RLS partout.** Écritures uniquement via des fonctions RPC `security definer set search_path = ''`.
  Droits par colonne (`grant insert (…)` / `grant update (…)`), `revoke all … from anon, authenticated` d'abord.
- Fonctions d'aide dans le schéma `prive` : `est_membre`, `a_role`, `est_admin`, `peut_acceder_boutique(boutique_id,
  entreprise_id)`, `est_compta`, `peut_lire_compta`, `est_vendeur`, `gere_catalogue`, `est_acheteur`,
  `peut_lire_achats`, `verifier_vendeur_boutique`, `verifier_acheteur_boutique`, `gere_stock`,
  `verifier_gestion_stock`. Tout mouvement de stock passe par `prive.mouvementer_stock(…)` (CMUP, contrôle du stock négatif).
- **Montants entiers en FCFA** (`bigint`), jamais de décimales. Quantités `numeric(14,3)`.
- **Numérotation continue sans trou** par compteurs verrouillés : `prive.compteurs_ecritures` (journal/exercice),
  `prive.compteurs_documents` via `prive.prochain_numero(entreprise, type, année)`. Numéro attribué à la validation.
- **Inaltérabilité** : écritures, documents et règlements validés protégés par triggers (contournement de test :
  `set facturall.purge = 'on'`). On corrige par contre-passation (écritures) ou avoir (factures).
- **Écritures automatiques** via `prive.ecriture_automatique(…)` avec une `origine` (`vente`, `avoir`,
  `reglement`, `achat`, `avoir_achat`, `paiement_fournisseur`) ; elles ne sont pas contre-passables à la main.
  Tiers sur les lignes : `ecriture_lignes.client_id` / `fournisseur_id`.
- Une nouvelle migration doit s'accompagner d'un fichier de tests `supabase/tests/<module>.test.mjs`
  ajouté au script `test:db`. Après application sur Supabase, renommer le fichier avec la version enregistrée.
- Rôles : `proprietaire`, `admin`, `comptable`, `gestionnaire`, `vendeur`, `lecteur`.
  Compta : saisie proprio/admin/comptable, lecture + lecteur. Ventes : tous sauf lecteur (vendeur limité à ses
  boutiques). Catalogue, TVA, avoirs, achats : proprio/admin/comptable/gestionnaire. Achats invisibles aux vendeurs.

## Comptes par défaut (plan SYSCOHADA de base)

411 clients, 401 fournisseurs, 701 / 706 ventes, 601 / 6057 achats, 4431 TVA collectée, 4452 TVA déductible,
521 banque, 571 caisse, 552 Mobile Money. Journaux : AC, VT, BQ, CA, MM, OD, AN.
TVA par défaut : 18 % (UEMOA), 19 % au Niger, plus « Exonéré ».

## Conventions d'interface

- Montants : `formaterXOF`, `lireMontantXOF`, composant `ChampMontant` (sélectionne tout au clic).
- Montant en lettres sur les factures : `montantEnLettres` (orthographe traditionnelle).
- Pages de module : un `layout.tsx` avec contexte (`VentesProvider`, `AchatsProvider`) et onglets ;
  éditeur de document en pleine page (`/…/document?id=` ou `?type=`), brouillon puis validation.
- Éviter `setState` synchrone dans `useEffect` (règle lint `react-hooks/set-state-in-effect`) :
  charger avec `.then()` et un drapeau `actif`, ou clé de résultat.

## État d'avancement

Fait : socle (entreprises, boutiques, membres, invitations), comptabilité (plan, journaux, exercices, saisie simple
et avancée, balance, grand livre), ventes (clients, articles, TVA, devis, factures, règlements, avoirs, impression),
achats (fournisseurs, factures fournisseurs, paiements, avoirs), stock (articles suivis, CMUP par boutique, mouvements
automatiques à la validation des factures et avoirs, entrées/sorties manuelles, transferts, inventaires).

À faire, dans l'ordre prévu :
1. Ventes et caisse sur **mobile** (encaissement rapide, ticket).
2. **Rapprochement bancaire** : import CSV / Excel / PDF ou saisie manuelle, pointage avec les écritures 52x/55x/57x.
3. Clôture d'exercice et états financiers SYSCOHADA (bilan, compte de résultat), dont la variation de stock
   (603x / 3x, inventaire intermittent) à partir de la valorisation CMUP.
