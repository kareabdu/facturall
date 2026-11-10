-- =============================================================================
-- FacturAll — Gestion des stocks
--
--   • articles.suivi_stock / seuil_alerte : articles stockés (biens uniquement)
--   • parametres_stock      : stock négatif autorisé ou non
--   • stocks                : quantité, valeur et CMUP par boutique et par article
--   • mouvements_stock      : journal inaltérable de toutes les entrées et sorties
--   • transferts_stock      : transferts entre boutiques + lignes_transferts_stock
--   • inventaires           : comptages physiques + lignes_inventaire
--
-- Règles garanties par la base :
--   • valorisation au coût moyen unitaire pondéré (CMUP), par boutique : une entrée
--     recalcule le CMUP, une sortie se fait au CMUP sans le modifier ;
--   • mouvements automatiques à la validation des documents :
--       facture fournisseur → entrée au coût d'achat HT (remises déduites) ;
--       avoir fournisseur   → sortie (retour) au CMUP ;
--       facture client      → sortie au CMUP ;
--       avoir client        → entrée (retour) au coût de la sortie d'origine ;
--   • un transfert sort de la boutique source au CMUP et entre à la même valeur ;
--   • un inventaire validé ramène le stock à la quantité comptée (écarts au CMUP) ;
--   • le stock ne peut pas devenir négatif, sauf si l'entreprise l'autorise ;
--   • numérotation continue : TR-2026-00001 (transferts), INV-2026-00001 (inventaires) ;
--   • mouvements, transferts et inventaires validés sont inaltérables ;
--   • gestion : propriétaire, admin, comptable, gestionnaire (dans leurs boutiques) ;
--     lecture des valeurs : + lecteur. Les vendeurs ne voient que les quantités
--     (fonction disponibilites_stock), pas les coûts.
--
-- Comptabilité : inventaire intermittent SYSCOHADA (achats en 60x) ; la variation
-- de stock (603x / 3x) sera passée à la clôture d'exercice.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Droits
-- -----------------------------------------------------------------------------
create or replace function prive.gere_stock(p_entreprise_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select prive.a_role(p_entreprise_id,
    array['proprietaire', 'admin', 'comptable', 'gestionnaire']::public.role_membre[]);
$$;

revoke all on function prive.gere_stock(uuid) from public, anon;
grant execute on function prive.gere_stock(uuid) to authenticated;

create or replace function prive.verifier_gestion_stock(p_entreprise_id uuid, p_boutique_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if not prive.gere_stock(p_entreprise_id) then
    raise exception 'Droits insuffisants pour gérer le stock.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.boutiques b where b.id = p_boutique_id and b.entreprise_id = p_entreprise_id and b.active)
     or not prive.peut_acceder_boutique(p_boutique_id, p_entreprise_id) then
    raise exception 'Boutique introuvable, désactivée ou non autorisée.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function prive.verifier_gestion_stock(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Articles stockés
-- -----------------------------------------------------------------------------
alter table public.articles
  add column suivi_stock  boolean not null default false,
  add column seuil_alerte numeric(14, 3) check (seuil_alerte is null or seuil_alerte >= 0),
  add constraint articles_suivi_stock_biens check (not suivi_stock or type = 'bien');

grant insert (suivi_stock, seuil_alerte) on public.articles to authenticated;
grant update (suivi_stock, seuil_alerte) on public.articles to authenticated;

-- -----------------------------------------------------------------------------
-- Paramètres
-- -----------------------------------------------------------------------------
create table public.parametres_stock (
  entreprise_id          uuid primary key references public.entreprises (id) on delete cascade,
  autoriser_stock_negatif boolean not null default false,
  updated_at             timestamptz not null default now()
);

create trigger parametres_stock_updated_at
  before update on public.parametres_stock
  for each row execute function prive.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Stocks par boutique
-- -----------------------------------------------------------------------------
create table public.stocks (
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  boutique_id   uuid not null,
  article_id    uuid not null,
  quantite      numeric(14, 3) not null default 0,
  valeur        bigint not null default 0,
  cmup          bigint not null default 0 check (cmup >= 0),
  updated_at    timestamptz not null default now(),
  primary key (boutique_id, article_id),
  foreign key (boutique_id, entreprise_id) references public.boutiques (id, entreprise_id),
  foreign key (article_id, entreprise_id) references public.articles (id, entreprise_id)
);
create index stocks_entreprise_article_idx on public.stocks (entreprise_id, article_id);
create index stocks_article_idx on public.stocks (article_id, entreprise_id);
create index stocks_boutique_idx on public.stocks (boutique_id, entreprise_id);

-- -----------------------------------------------------------------------------
-- Transferts entre boutiques
-- -----------------------------------------------------------------------------
create table public.transferts_stock (
  id                      uuid primary key default gen_random_uuid(),
  entreprise_id           uuid not null references public.entreprises (id) on delete cascade,
  numero                  text not null,
  boutique_source_id      uuid not null,
  boutique_destination_id uuid not null,
  date_transfert          date not null default current_date,
  notes                   text check (notes is null or length(notes) <= 2000),
  valeur_totale           bigint not null default 0 check (valeur_totale >= 0),
  created_by              uuid references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  unique (id, entreprise_id),
  unique (entreprise_id, numero),
  check (boutique_source_id <> boutique_destination_id),
  foreign key (boutique_source_id, entreprise_id) references public.boutiques (id, entreprise_id),
  foreign key (boutique_destination_id, entreprise_id) references public.boutiques (id, entreprise_id)
);
create index transferts_stock_liste_idx on public.transferts_stock (entreprise_id, date_transfert desc);
create index transferts_stock_source_idx on public.transferts_stock (boutique_source_id, entreprise_id);
create index transferts_stock_destination_idx on public.transferts_stock (boutique_destination_id, entreprise_id);
create index transferts_stock_created_by_idx on public.transferts_stock (created_by);

create table public.lignes_transferts_stock (
  id            uuid primary key default gen_random_uuid(),
  transfert_id  uuid not null,
  entreprise_id uuid not null,
  ordre         smallint not null,
  article_id    uuid not null,
  quantite      numeric(14, 3) not null check (quantite > 0),
  valeur        bigint not null check (valeur >= 0),
  unique (transfert_id, ordre),
  foreign key (transfert_id, entreprise_id) references public.transferts_stock (id, entreprise_id) on delete cascade,
  foreign key (article_id, entreprise_id) references public.articles (id, entreprise_id)
);
create index lignes_transferts_stock_transfert_idx on public.lignes_transferts_stock (transfert_id, entreprise_id);
create index lignes_transferts_stock_article_idx on public.lignes_transferts_stock (article_id, entreprise_id);

-- -----------------------------------------------------------------------------
-- Inventaires
-- -----------------------------------------------------------------------------
create table public.inventaires (
  id              uuid primary key default gen_random_uuid(),
  entreprise_id   uuid not null references public.entreprises (id) on delete cascade,
  boutique_id     uuid not null,
  numero          text,
  statut          text not null default 'brouillon' check (statut in ('brouillon', 'valide')),
  date_inventaire date not null default current_date,
  notes           text check (notes is null or length(notes) <= 2000),
  ecart_valeur    bigint not null default 0,
  created_by      uuid references auth.users (id) on delete set null,
  valide_le       timestamptz,
  valide_par      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, entreprise_id),
  check ((statut = 'brouillon') = (numero is null)),
  foreign key (boutique_id, entreprise_id) references public.boutiques (id, entreprise_id)
);
create unique index inventaires_numero_unique on public.inventaires (entreprise_id, numero) where numero is not null;
create index inventaires_liste_idx on public.inventaires (entreprise_id, date_inventaire desc);
create index inventaires_boutique_idx on public.inventaires (boutique_id, entreprise_id);
create index inventaires_created_by_idx on public.inventaires (created_by);
create index inventaires_valide_par_idx on public.inventaires (valide_par);

create trigger inventaires_updated_at
  before update on public.inventaires
  for each row execute function prive.maj_updated_at();

create table public.lignes_inventaire (
  id                 uuid primary key default gen_random_uuid(),
  inventaire_id      uuid not null,
  entreprise_id      uuid not null,
  ordre              smallint not null,
  article_id         uuid not null,
  quantite_comptee   numeric(14, 3) not null check (quantite_comptee >= 0),
  quantite_theorique numeric(14, 3),
  ecart              numeric(14, 3),
  valeur_ecart       bigint,
  unique (inventaire_id, ordre),
  unique (inventaire_id, article_id),
  foreign key (inventaire_id, entreprise_id) references public.inventaires (id, entreprise_id) on delete cascade,
  foreign key (article_id, entreprise_id) references public.articles (id, entreprise_id)
);
create index lignes_inventaire_inventaire_idx on public.lignes_inventaire (inventaire_id, entreprise_id);
create index lignes_inventaire_article_idx on public.lignes_inventaire (article_id, entreprise_id);

-- -----------------------------------------------------------------------------
-- Mouvements de stock
-- -----------------------------------------------------------------------------
create table public.mouvements_stock (
  id                uuid primary key default gen_random_uuid(),
  entreprise_id     uuid not null references public.entreprises (id) on delete cascade,
  boutique_id       uuid not null,
  article_id        uuid not null,
  date_mouvement    date not null,
  type              text not null check (type in (
                      'entree_achat', 'retour_fournisseur', 'sortie_vente', 'retour_client',
                      'transfert_sortie', 'transfert_entree', 'inventaire', 'entree_manuelle', 'sortie_manuelle')),
  quantite          numeric(14, 3) not null check (quantite <> 0),  -- positive : entrée, négative : sortie
  cout_unitaire     bigint not null check (cout_unitaire >= 0),
  valeur            bigint not null,                                -- même signe que la quantité
  quantite_apres    numeric(14, 3) not null,
  valeur_apres      bigint not null,
  cmup_apres        bigint not null,
  document_vente_id uuid,
  document_achat_id uuid,
  transfert_id      uuid,
  inventaire_id     uuid,
  motif             text check (motif is null or length(motif) <= 300),
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  foreign key (boutique_id, entreprise_id) references public.boutiques (id, entreprise_id),
  foreign key (article_id, entreprise_id) references public.articles (id, entreprise_id),
  foreign key (document_vente_id, entreprise_id) references public.documents_vente (id, entreprise_id),
  foreign key (document_achat_id, entreprise_id) references public.documents_achat (id, entreprise_id),
  foreign key (transfert_id, entreprise_id) references public.transferts_stock (id, entreprise_id),
  foreign key (inventaire_id, entreprise_id) references public.inventaires (id, entreprise_id)
);
create index mouvements_stock_article_idx on public.mouvements_stock (boutique_id, article_id, created_at desc);
create index mouvements_stock_liste_idx on public.mouvements_stock (entreprise_id, date_mouvement desc);
create index mouvements_stock_boutique_idx on public.mouvements_stock (boutique_id, entreprise_id);
create index mouvements_stock_article_fk_idx on public.mouvements_stock (article_id, entreprise_id);
create index mouvements_stock_vente_idx on public.mouvements_stock (document_vente_id, entreprise_id);
create index mouvements_stock_achat_idx on public.mouvements_stock (document_achat_id, entreprise_id);
create index mouvements_stock_transfert_idx on public.mouvements_stock (transfert_id, entreprise_id);
create index mouvements_stock_inventaire_idx on public.mouvements_stock (inventaire_id, entreprise_id);
create index mouvements_stock_created_by_idx on public.mouvements_stock (created_by);

-- -----------------------------------------------------------------------------
-- Inaltérabilité
-- -----------------------------------------------------------------------------
create or replace function prive.proteger_historique_stock()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'Les mouvements et transferts de stock enregistrés ne peuvent être ni modifiés ni supprimés.'
    using errcode = '42501';
end;
$$;

create trigger mouvements_stock_inalterables
  before update or delete on public.mouvements_stock
  for each row execute function prive.proteger_historique_stock();
-- Transfert : seul le total, calculé une fois en fin d'enregistrement, peut être renseigné
create or replace function prive.proteger_transferts_stock()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and old.valeur_totale = 0
     and (to_jsonb(new) - 'valeur_totale') = (to_jsonb(old) - 'valeur_totale') then
    return new;
  end if;
  raise exception 'Le transfert % est enregistré : il ne peut être ni modifié ni supprimé.', old.numero
    using errcode = '42501';
end;
$$;

create trigger transferts_stock_inalterables
  before update or delete on public.transferts_stock
  for each row execute function prive.proteger_transferts_stock();
create trigger lignes_transferts_stock_inalterables
  before update or delete on public.lignes_transferts_stock
  for each row execute function prive.proteger_historique_stock();

create or replace function prive.proteger_inventaires()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' or old.statut = 'brouillon' then
    return coalesce(new, old);
  end if;
  raise exception 'L''inventaire % est validé : il ne peut plus être modifié ni supprimé.', old.numero
    using errcode = '42501';
end;
$$;

create trigger inventaires_inalterables
  before update or delete on public.inventaires
  for each row execute function prive.proteger_inventaires();

create or replace function prive.proteger_lignes_inventaire()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_statut text;
begin
  if coalesce(current_setting('facturall.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select statut into v_statut from public.inventaires where id = coalesce(new.inventaire_id, old.inventaire_id);
  if v_statut is not null and v_statut <> 'brouillon' then
    raise exception 'Les lignes d''un inventaire validé ne peuvent plus être modifiées.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger lignes_inventaire_inalterables
  before insert or update or delete on public.lignes_inventaire
  for each row execute function prive.proteger_lignes_inventaire();

-- Un article ne peut cesser d'être suivi tant qu'il reste du stock
create or replace function prive.controler_suivi_stock()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.suivi_stock and not new.suivi_stock
     and exists (select 1 from public.stocks where article_id = new.id and quantite <> 0) then
    raise exception 'L''article « % » a encore du stock : soldez-le (inventaire ou sortie) avant d''arrêter son suivi.',
      new.designation using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger articles_controler_suivi_stock
  before update of suivi_stock on public.articles
  for each row execute function prive.controler_suivi_stock();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.parametres_stock        enable row level security;
alter table public.stocks                  enable row level security;
alter table public.mouvements_stock        enable row level security;
alter table public.transferts_stock        enable row level security;
alter table public.lignes_transferts_stock enable row level security;
alter table public.inventaires             enable row level security;
alter table public.lignes_inventaire       enable row level security;

revoke all on public.parametres_stock, public.stocks, public.mouvements_stock, public.transferts_stock,
  public.lignes_transferts_stock, public.inventaires, public.lignes_inventaire from anon, authenticated;

grant select on public.parametres_stock, public.stocks, public.mouvements_stock, public.transferts_stock,
  public.lignes_transferts_stock, public.inventaires, public.lignes_inventaire to authenticated;
grant update (autoriser_stock_negatif) on public.parametres_stock to authenticated;

create policy "parametres_stock : lecture" on public.parametres_stock for select to authenticated
  using (prive.est_membre(entreprise_id));
create policy "parametres_stock : modification admin" on public.parametres_stock for update to authenticated
  using (prive.est_admin(entreprise_id)) with check (prive.est_admin(entreprise_id));

create policy "stocks : lecture selon la boutique" on public.stocks for select to authenticated
  using (prive.peut_lire_achats(entreprise_id) and prive.peut_acceder_boutique(boutique_id, entreprise_id));
create policy "mouvements_stock : lecture selon la boutique" on public.mouvements_stock for select to authenticated
  using (prive.peut_lire_achats(entreprise_id) and prive.peut_acceder_boutique(boutique_id, entreprise_id));
create policy "transferts_stock : lecture selon les boutiques" on public.transferts_stock for select to authenticated
  using (prive.peut_lire_achats(entreprise_id)
         and (prive.peut_acceder_boutique(boutique_source_id, entreprise_id)
              or prive.peut_acceder_boutique(boutique_destination_id, entreprise_id)));
create policy "lignes_transferts_stock : lecture selon le transfert" on public.lignes_transferts_stock
  for select to authenticated
  using (exists (select 1 from public.transferts_stock t where t.id = transfert_id));
create policy "inventaires : lecture selon la boutique" on public.inventaires for select to authenticated
  using (prive.peut_lire_achats(entreprise_id) and prive.peut_acceder_boutique(boutique_id, entreprise_id));
create policy "lignes_inventaire : lecture selon l'inventaire" on public.lignes_inventaire
  for select to authenticated
  using (exists (select 1 from public.inventaires i where i.id = inventaire_id));

-- =============================================================================
-- Initialisation
-- =============================================================================
create or replace function prive.apres_creation_entreprise_stock()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.parametres_stock (entreprise_id) values (new.id) on conflict (entreprise_id) do nothing;
  return new;
end;
$$;

create trigger entreprises_initialiser_stock
  after insert on public.entreprises
  for each row execute function prive.apres_creation_entreprise_stock();

insert into public.parametres_stock (entreprise_id)
select id from public.entreprises
on conflict (entreprise_id) do nothing;

-- =============================================================================
-- Moteur des mouvements (CMUP)
-- =============================================================================
-- Enregistre un mouvement et met à jour le stock de la boutique. Retourne l'id du mouvement.
--   p_quantite > 0 : entrée, valorisée à p_valeur (sinon au CMUP actuel) ; le CMUP est recalculé.
--   p_quantite < 0 : sortie au CMUP (le CMUP ne change pas) ; refusée si le stock devient négatif,
--                    sauf p_controler = false ou stock négatif autorisé par l'entreprise.
create or replace function prive.mouvementer_stock(
  p_entreprise_id     uuid,
  p_boutique_id       uuid,
  p_article_id        uuid,
  p_type              text,
  p_quantite          numeric,
  p_date              date,
  p_valeur            bigint default null,
  p_controler         boolean default true,
  p_document_vente_id uuid default null,
  p_document_achat_id uuid default null,
  p_transfert_id      uuid default null,
  p_inventaire_id     uuid default null,
  p_motif             text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_a public.articles;
  v_s public.stocks;
  v_q numeric;
  v_val bigint;
  v_val_apres bigint;
  v_cmup bigint;
  v_id uuid;
begin
  if p_quantite is null or p_quantite = 0 or p_quantite <> round(p_quantite, 3) then
    raise exception 'Quantité de stock invalide.' using errcode = '22023';
  end if;
  select * into v_a from public.articles where id = p_article_id and entreprise_id = p_entreprise_id;
  if v_a.id is null then
    raise exception 'Article introuvable.' using errcode = '22023';
  end if;
  if not v_a.suivi_stock then
    raise exception 'L''article « % » n''est pas suivi en stock.', v_a.designation using errcode = '22023';
  end if;

  insert into public.stocks (entreprise_id, boutique_id, article_id)
  values (p_entreprise_id, p_boutique_id, p_article_id)
  on conflict (boutique_id, article_id) do nothing;
  select * into v_s from public.stocks
  where boutique_id = p_boutique_id and article_id = p_article_id for update;

  v_q := v_s.quantite + p_quantite;

  if p_quantite > 0 then
    v_val := coalesce(p_valeur, round(p_quantite * v_s.cmup)::bigint);
    if v_val < 0 then
      raise exception 'La valeur d''une entrée de stock ne peut pas être négative.' using errcode = '22023';
    end if;
    if v_s.quantite <= 0 then
      -- Stock vide (ou négatif) : le coût de l'entrée devient le CMUP
      v_cmup := round(v_val / p_quantite)::bigint;
      v_val_apres := round(v_q * v_cmup)::bigint;
    else
      v_val_apres := v_s.valeur + v_val;
      v_cmup := round(v_val_apres / v_q)::bigint;
    end if;
  else
    if p_controler and v_q < 0 and not coalesce(
         (select autoriser_stock_negatif from public.parametres_stock where entreprise_id = p_entreprise_id), false) then
      raise exception 'Stock insuffisant pour « % » : % disponible(s), % demandé(s).',
        v_a.designation, trim_scale(v_s.quantite), trim_scale(-p_quantite) using errcode = '22023';
    end if;
    v_cmup := v_s.cmup;
    if v_q = 0 then
      v_val := -v_s.valeur;                        -- stock soldé : plus aucune valeur résiduelle
    else
      v_val := -round(-p_quantite * v_s.cmup)::bigint;
      if v_q > 0 and v_s.valeur + v_val < 0 then
        v_val := -v_s.valeur;
      end if;
    end if;
    v_val_apres := v_s.valeur + v_val;
  end if;

  update public.stocks
  set quantite = v_q, valeur = v_val_apres, cmup = v_cmup, updated_at = now()
  where boutique_id = p_boutique_id and article_id = p_article_id;

  insert into public.mouvements_stock (entreprise_id, boutique_id, article_id, date_mouvement, type, quantite,
    cout_unitaire, valeur, quantite_apres, valeur_apres, cmup_apres, document_vente_id, document_achat_id,
    transfert_id, inventaire_id, motif, created_by)
  values (p_entreprise_id, p_boutique_id, p_article_id, coalesce(p_date, current_date), p_type, p_quantite,
    round(abs(v_val) / abs(p_quantite))::bigint, v_val, v_q, v_val_apres, v_cmup, p_document_vente_id,
    p_document_achat_id, p_transfert_id, p_inventaire_id, left(nullif(trim(p_motif), ''), 300), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function prive.mouvementer_stock(uuid, uuid, uuid, text, numeric, date, bigint, boolean,
  uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

-- =============================================================================
-- Mouvements automatiques à la validation des documents
-- =============================================================================
create or replace function prive.stock_documents_vente()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if new.type = 'facture' then
    for r in
      select l.article_id, sum(l.quantite) q
      from public.lignes_documents_vente l
      join public.articles a on a.id = l.article_id
      where l.document_id = new.id and a.suivi_stock
      group by l.article_id
    loop
      perform prive.mouvementer_stock(new.entreprise_id, new.boutique_id, r.article_id, 'sortie_vente', -r.q,
        new.date_document, p_document_vente_id => new.id, p_motif => 'Facture ' || new.numero);
    end loop;
  elsif new.type = 'avoir' and new.document_origine_id is not null then
    -- Retour : on réintègre exactement ce que la facture d'origine a sorti, à la même valeur
    for r in
      select m.article_id, sum(m.quantite) q, sum(m.valeur)::bigint v
      from public.mouvements_stock m
      join public.articles a on a.id = m.article_id
      where m.document_vente_id = new.document_origine_id and a.suivi_stock
      group by m.article_id
      having sum(m.quantite) <> 0
    loop
      perform prive.mouvementer_stock(new.entreprise_id, new.boutique_id, r.article_id, 'retour_client', -r.q,
        new.date_document, p_valeur => -r.v, p_controler => false,
        p_document_vente_id => new.id, p_motif => 'Avoir ' || new.numero);
    end loop;
  end if;
  return new;
end;
$$;

create trigger documents_vente_stock
  after update of statut on public.documents_vente
  for each row
  when (old.statut = 'brouillon' and new.statut = 'valide' and new.type in ('facture', 'avoir'))
  execute function prive.stock_documents_vente();

create or replace function prive.stock_documents_achat()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if new.type = 'facture' then
    for r in
      select l.article_id, sum(l.quantite) q, sum(l.montant_ht)::bigint v
      from public.lignes_documents_achat l
      join public.articles a on a.id = l.article_id
      where l.document_id = new.id and a.suivi_stock
      group by l.article_id
    loop
      perform prive.mouvementer_stock(new.entreprise_id, new.boutique_id, r.article_id, 'entree_achat', r.q,
        new.date_document, p_valeur => r.v, p_document_achat_id => new.id,
        p_motif => 'Facture ' || new.numero_fournisseur || ' (' || new.numero || ')');
    end loop;
  elsif new.type = 'avoir' and new.document_origine_id is not null then
    -- Retour au fournisseur : on ressort ce que la facture d'origine a fait entrer, au CMUP
    for r in
      select m.article_id, sum(m.quantite) q
      from public.mouvements_stock m
      join public.articles a on a.id = m.article_id
      where m.document_achat_id = new.document_origine_id and a.suivi_stock
      group by m.article_id
      having sum(m.quantite) <> 0
    loop
      perform prive.mouvementer_stock(new.entreprise_id, new.boutique_id, r.article_id, 'retour_fournisseur', -r.q,
        new.date_document, p_document_achat_id => new.id, p_motif => 'Avoir ' || new.numero);
    end loop;
  end if;
  return new;
end;
$$;

create trigger documents_achat_stock
  after update of statut on public.documents_achat
  for each row
  when (old.statut = 'brouillon' and new.statut = 'valide' and new.type in ('facture', 'avoir'))
  execute function prive.stock_documents_achat();

-- =============================================================================
-- Fonctions RPC du stock
-- =============================================================================

-- Entrée ou sortie manuelle (stock initial, casse, perte, consommation interne…).
-- p_quantite > 0 : entrée (au coût unitaire indiqué, sinon au CMUP) ; < 0 : sortie au CMUP.
create or replace function public.ajuster_stock(
  p_entreprise_id  uuid,
  p_boutique_id    uuid,
  p_article_id     uuid,
  p_quantite       numeric,
  p_motif          text,
  p_cout_unitaire  bigint default null,
  p_date           date default current_date
)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  perform prive.verifier_gestion_stock(p_entreprise_id, p_boutique_id);
  if coalesce(trim(p_motif), '') = '' then
    raise exception 'Indiquez le motif du mouvement.' using errcode = '22023';
  end if;
  if p_cout_unitaire is not null and p_cout_unitaire < 0 then
    raise exception 'Le coût unitaire ne peut pas être négatif.' using errcode = '22023';
  end if;
  if p_quantite is null or p_quantite = 0 then
    raise exception 'La quantité ne peut pas être nulle.' using errcode = '22023';
  end if;
  return prive.mouvementer_stock(p_entreprise_id, p_boutique_id, p_article_id,
    case when p_quantite > 0 then 'entree_manuelle' else 'sortie_manuelle' end,
    p_quantite, coalesce(p_date, current_date),
    p_valeur => case when p_quantite > 0 and p_cout_unitaire is not null
                     then round(p_quantite * p_cout_unitaire)::bigint end,
    p_motif => p_motif);
end;
$$;

-- Transfert immédiat entre deux boutiques. p_lignes : [{ "article_id", "quantite" }]
create or replace function public.transferer_stock(
  p_entreprise_id  uuid,
  p_source_id      uuid,
  p_destination_id uuid,
  p_lignes         jsonb,
  p_date           date default current_date,
  p_notes          text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_numero text;
  v_date date := coalesce(p_date, current_date);
  v_ligne jsonb;
  v_ordre smallint := 0;
  v_article uuid;
  v_qte numeric;
  v_sortie uuid;
  v_valeur bigint;
  v_total bigint := 0;
begin
  perform prive.verifier_gestion_stock(p_entreprise_id, p_source_id);
  perform prive.verifier_gestion_stock(p_entreprise_id, p_destination_id);
  if p_source_id = p_destination_id then
    raise exception 'Choisissez deux boutiques différentes.' using errcode = '22023';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Ajoutez au moins un article à transférer.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lignes) > 300 then
    raise exception 'Trop de lignes (300 au maximum).' using errcode = '22023';
  end if;

  v_numero := 'TR-' || extract(year from v_date)::text || '-' ||
              lpad(prive.prochain_numero(p_entreprise_id, 'transfert_stock', extract(year from v_date)::integer)::text, 5, '0');

  insert into public.transferts_stock (entreprise_id, numero, boutique_source_id, boutique_destination_id,
                                       date_transfert, notes, created_by)
  values (p_entreprise_id, v_numero, p_source_id, p_destination_id, v_date, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_ordre := v_ordre + 1;
    begin
      v_article := (v_ligne ->> 'article_id')::uuid;
      v_qte := (v_ligne ->> 'quantite')::numeric;
    exception when others then
      raise exception 'Ligne % : article ou quantité invalide.', v_ordre using errcode = '22023';
    end;
    if v_article is null or v_qte is null or v_qte <= 0 or v_qte <> round(v_qte, 3) then
      raise exception 'Ligne % : article ou quantité invalide.', v_ordre using errcode = '22023';
    end if;

    v_sortie := prive.mouvementer_stock(p_entreprise_id, p_source_id, v_article, 'transfert_sortie', -v_qte, v_date,
      p_transfert_id => v_id, p_motif => 'Transfert ' || v_numero);
    select -valeur into v_valeur from public.mouvements_stock where id = v_sortie;
    perform prive.mouvementer_stock(p_entreprise_id, p_destination_id, v_article, 'transfert_entree', v_qte, v_date,
      p_valeur => v_valeur, p_transfert_id => v_id, p_motif => 'Transfert ' || v_numero);

    insert into public.lignes_transferts_stock (transfert_id, entreprise_id, ordre, article_id, quantite, valeur)
    values (v_id, p_entreprise_id, v_ordre, v_article, v_qte, v_valeur);
    v_total := v_total + v_valeur;
  end loop;

  update public.transferts_stock set valeur_totale = v_total where id = v_id;
  return v_id;
end;
$$;

-- Crée ou met à jour un inventaire brouillon. p_lignes : [{ "article_id", "quantite_comptee" }]
create or replace function public.enregistrer_inventaire(
  p_entreprise_id uuid,
  p_boutique_id   uuid,
  p_lignes        jsonb,
  p_date          date default current_date,
  p_notes         text default null,
  p_inventaire_id uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := p_inventaire_id;
  v_ligne jsonb;
  v_ordre smallint := 0;
  v_article public.articles;
  v_qte numeric;
begin
  perform prive.verifier_gestion_stock(p_entreprise_id, p_boutique_id);
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Ajoutez au moins un article compté.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lignes) > 2000 then
    raise exception 'Trop de lignes (2000 au maximum).' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.inventaires (entreprise_id, boutique_id, date_inventaire, notes, created_by)
    values (p_entreprise_id, p_boutique_id, coalesce(p_date, current_date), nullif(trim(p_notes), ''), auth.uid())
    returning id into v_id;
  else
    update public.inventaires
    set boutique_id = p_boutique_id, date_inventaire = coalesce(p_date, current_date), notes = nullif(trim(p_notes), '')
    where id = v_id and entreprise_id = p_entreprise_id and statut = 'brouillon'
      and prive.peut_acceder_boutique(boutique_id, entreprise_id);
    if not found then
      raise exception 'Inventaire brouillon introuvable (ou déjà validé).' using errcode = '22023';
    end if;
    delete from public.lignes_inventaire where inventaire_id = v_id;
  end if;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_ordre := v_ordre + 1;
    v_article := null;
    begin
      select * into v_article from public.articles
      where id = (v_ligne ->> 'article_id')::uuid and entreprise_id = p_entreprise_id;
      v_qte := (v_ligne ->> 'quantite_comptee')::numeric;
    exception when others then
      raise exception 'Ligne % : article ou quantité invalide.', v_ordre using errcode = '22023';
    end;
    if v_article.id is null or not v_article.suivi_stock then
      raise exception 'Ligne % : article introuvable ou non suivi en stock.', v_ordre using errcode = '22023';
    end if;
    if v_qte is null or v_qte < 0 or v_qte <> round(v_qte, 3) then
      raise exception 'Ligne % : quantité comptée invalide (positive ou nulle, 3 décimales au plus).', v_ordre
        using errcode = '22023';
    end if;
    if exists (select 1 from public.lignes_inventaire where inventaire_id = v_id and article_id = v_article.id) then
      raise exception 'L''article « % » est compté deux fois.', v_article.designation using errcode = '22023';
    end if;
    insert into public.lignes_inventaire (inventaire_id, entreprise_id, ordre, article_id, quantite_comptee)
    values (v_id, p_entreprise_id, v_ordre, v_article.id, v_qte);
  end loop;

  return v_id;
end;
$$;

create or replace function public.supprimer_inventaire(p_inventaire_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_i public.inventaires;
begin
  select * into v_i from public.inventaires where id = p_inventaire_id;
  if v_i.id is null then
    raise exception 'Inventaire introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_gestion_stock(v_i.entreprise_id, v_i.boutique_id);
  delete from public.inventaires where id = p_inventaire_id; -- refusé par trigger si validé
end;
$$;

-- Valide un inventaire : numéro INV, écarts constatés et mouvements d'ajustement au CMUP.
create or replace function public.valider_inventaire(p_inventaire_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_i public.inventaires;
  v_numero text;
  l record;
  v_theo numeric;
  v_ecart numeric;
  v_mvt uuid;
  v_valeur bigint;
  v_total bigint := 0;
begin
  select * into v_i from public.inventaires where id = p_inventaire_id for update;
  if v_i.id is null then
    raise exception 'Inventaire introuvable.' using errcode = '22023';
  end if;
  perform prive.verifier_gestion_stock(v_i.entreprise_id, v_i.boutique_id);
  if v_i.statut <> 'brouillon' then
    raise exception 'Cet inventaire est déjà validé.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.lignes_inventaire where inventaire_id = v_i.id) then
    raise exception 'L''inventaire ne comporte aucune ligne.' using errcode = '22023';
  end if;

  v_numero := 'INV-' || extract(year from v_i.date_inventaire)::text || '-' ||
              lpad(prive.prochain_numero(v_i.entreprise_id, 'inventaire',
                   extract(year from v_i.date_inventaire)::integer)::text, 5, '0');

  for l in select * from public.lignes_inventaire where inventaire_id = v_i.id order by ordre loop
    insert into public.stocks (entreprise_id, boutique_id, article_id)
    values (v_i.entreprise_id, v_i.boutique_id, l.article_id)
    on conflict (boutique_id, article_id) do nothing;
    select quantite into v_theo from public.stocks
    where boutique_id = v_i.boutique_id and article_id = l.article_id for update;

    v_ecart := l.quantite_comptee - v_theo;
    v_valeur := 0;
    if v_ecart <> 0 then
      v_mvt := prive.mouvementer_stock(v_i.entreprise_id, v_i.boutique_id, l.article_id, 'inventaire', v_ecart,
        v_i.date_inventaire, p_controler => false, p_inventaire_id => v_i.id, p_motif => 'Inventaire ' || v_numero);
      select valeur into v_valeur from public.mouvements_stock where id = v_mvt;
    end if;

    update public.lignes_inventaire
    set quantite_theorique = v_theo, ecart = v_ecart, valeur_ecart = v_valeur
    where id = l.id;
    v_total := v_total + v_valeur;
  end loop;

  update public.inventaires
  set statut = 'valide', numero = v_numero, ecart_valeur = v_total, valide_le = now(), valide_par = auth.uid()
  where id = v_i.id;

  return v_numero;
end;
$$;

-- Quantités disponibles d'une boutique (sans les coûts) : utilisable par les vendeurs.
create or replace function public.disponibilites_stock(p_entreprise_id uuid, p_boutique_id uuid)
returns table (article_id uuid, quantite numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not prive.est_membre(p_entreprise_id) or not prive.peut_acceder_boutique(p_boutique_id, p_entreprise_id) then
    raise exception 'Boutique introuvable ou non autorisée.' using errcode = '42501';
  end if;
  return query
    select s.article_id, s.quantite
    from public.stocks s
    join public.articles a on a.id = s.article_id
    where s.entreprise_id = p_entreprise_id and s.boutique_id = p_boutique_id and a.suivi_stock;
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke execute on function
  public.ajuster_stock(uuid, uuid, uuid, numeric, text, bigint, date),
  public.transferer_stock(uuid, uuid, uuid, jsonb, date, text),
  public.enregistrer_inventaire(uuid, uuid, jsonb, date, text, uuid),
  public.supprimer_inventaire(uuid),
  public.valider_inventaire(uuid),
  public.disponibilites_stock(uuid, uuid)
from public, anon;

grant execute on function
  public.ajuster_stock(uuid, uuid, uuid, numeric, text, bigint, date),
  public.transferer_stock(uuid, uuid, uuid, jsonb, date, text),
  public.enregistrer_inventaire(uuid, uuid, jsonb, date, text, uuid),
  public.supprimer_inventaire(uuid),
  public.valider_inventaire(uuid),
  public.disponibilites_stock(uuid, uuid)
to authenticated;

revoke all on function prive.stock_documents_vente(), prive.stock_documents_achat(),
  prive.apres_creation_entreprise_stock() from public, anon, authenticated;
