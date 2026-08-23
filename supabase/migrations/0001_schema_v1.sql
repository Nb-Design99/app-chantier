-- =====================================================================
-- App chantier électrique — SCHÉMA V1 (proposition, v0.1)
-- Périmètre V1 : affaires + étapes + métrés + liste matériel + catalogue favoris
-- (planning, documents, push, NIBT, photos = V2/V3, hors de ce fichier)
--
-- Principes de conception :
--  1. Toutes les PK des tables "terrain" sont des uuid GÉNÉRÉES CÔTÉ CLIENT.
--     → l'ouvrier peut créer hors ligne, l'id ne change jamais à la sync,
--       et un renvoi de la même opération est idempotent.
--  2. Pas de DELETE : soft-delete via `supprime_le`. Sinon impossible de
--     propager une suppression à un téléphone resté hors ligne 3 jours.
--  3. `updated_at` est posé PAR LE SERVEUR (trigger) → la sync descendante
--     est un simple `where updated_at > dernier_sync`.
--  4. Le matériel est un JOURNAL append-only (pas un compteur qu'on écrase).
--     Deux ouvriers hors ligne qui ajoutent 3 et 2 prises donnent 5, pas 2.
--  5. text + CHECK plutôt que ENUM : ajouter une valeur plus tard = 1 ligne,
--     sans migration bloquante.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Horodatage serveur
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

-- =====================================================================
-- 1. UTILISATEURS ET RÔLES
-- =====================================================================
create table public.profils (
  id         uuid primary key references auth.users(id) on delete cascade,
  nom        text not null,
  role       text not null default 'ouvrier' check (role in ('chef','ouvrier')),
  actif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_profils_touch before update on public.profils
  for each row execute function public.touch_updated_at();

-- security definer = contourne la RLS de profils, sinon récursion infinie
create or replace function public.est_chef()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.profils
    where id = auth.uid() and role = 'chef' and actif
  );
$fn$;

-- =====================================================================
-- 2. AFFAIRES
-- =====================================================================
create table public.affaires (
  id          uuid primary key,            -- généré côté client
  type        text not null check (type in ('chantier','depannage','remise_conformite')),
  nom         text not null,
  client      text,
  adresse     text,
  npa         text,
  localite    text,
  date_debut  date,
  statut      text not null default 'en_cours'
              check (statut in ('a_venir','en_cours','en_attente','termine')),
  notes       text,
  cree_par    uuid references public.profils(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  supprime_le timestamptz
);
create index affaires_sync_idx on public.affaires (updated_at);
create index affaires_statut_idx on public.affaires (statut, date_debut desc);
create trigger t_affaires_touch before update on public.affaires
  for each row execute function public.touch_updated_at();

-- Qui travaille sur quoi (l'ouvrier ne voit QUE ses affectations)
create table public.affectations (
  affaire_id uuid not null references public.affaires(id) on delete cascade,
  profil_id  uuid not null references public.profils(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (affaire_id, profil_id)
);
create index affectations_profil_idx on public.affectations (profil_id);

-- Droit d'accès à une affaire : chef = tout, ouvrier = ses affectations
create or replace function public.acces_affaire(a uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select public.est_chef() or exists (
    select 1 from public.affectations
    where affaire_id = a and profil_id = auth.uid()
  );
$fn$;

-- =====================================================================
-- 3. ÉTAPES DE CHANTIER (type = 'chantier' uniquement)
-- =====================================================================
create table public.etapes_modele (
  ordre   smallint primary key,
  libelle text not null
);
insert into public.etapes_modele (ordre, libelle) values
  (1, 'Radier'),
  (2, 'Dalle'),
  (3, 'Élévation'),
  (4, 'Tubage'),
  (5, 'Tirage de fil'),
  (6, 'Pose d''appareillage');

create table public.etapes (
  id          uuid primary key,
  affaire_id  uuid not null references public.affaires(id) on delete cascade,
  ordre       smallint not null,
  libelle     text not null,
  terminee    boolean not null default false,
  date_fin    date,
  note        text,                        -- « tube pour prise X à faire »
  updated_at  timestamptz not null default now(),
  supprime_le timestamptz,
  unique (affaire_id, ordre)
);
create index etapes_affaire_idx on public.etapes (affaire_id, ordre);
create index etapes_sync_idx on public.etapes (updated_at);
create trigger t_etapes_touch before update on public.etapes
  for each row execute function public.touch_updated_at();

-- Génération auto des 6 étapes à la création d'un chantier
create or replace function public.creer_etapes_chantier()
returns trigger language plpgsql as $fn$
begin
  if new.type = 'chantier' then
    insert into public.etapes (id, affaire_id, ordre, libelle)
    select gen_random_uuid(), new.id, m.ordre, m.libelle from public.etapes_modele m
    on conflict (affaire_id, ordre) do nothing;
  end if;
  return new;
end $fn$;
create trigger t_affaires_etapes after insert on public.affaires
  for each row execute function public.creer_etapes_chantier();

-- =====================================================================
-- 4. CATALOGUE ARTICLES (générique — marque non codée en dur)
-- =====================================================================
create table public.articles (
  id            uuid primary key default gen_random_uuid(),
  -- Numéro ELDAS® (le « numéro E » suisse, 9 chiffres). C'est LA donnée que
  -- Nathan veut voir sur la liste de matériel. Nullable : filet pour un article
  -- ajouté à la main ; il reste utilisable en saisie mais apparaît en manquant
  -- sur l'export (cf. vue materiel_export, colonne ref_manquante).
  e_no          text unique,
  ref_fabricant text,
  marque        text not null default 'Feller',
  gamme         text,                        -- 'EDIZIOdue'
  designation   text not null,
  nature        text not null default 'appareil'
                check (nature in ('appareil','plaque','cadre','boite','accessoire','autre')),
  type_fonction text,                        -- S0,S1,S3,S6,S13,T13,T23,poussoir,variateur…
  montage       text check (montage in ('encastre','apparent')),
  couleur       text,                        -- blanc, noir, anthracite, crème…
  dimension     text,                        -- 1x1, 1x2, 2x2
  actif         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index articles_recherche_idx on public.articles
  using gin (to_tsvector('french',
    designation || ' ' || coalesce(e_no, '') || ' ' || coalesce(ref_fabricant, '')));
create index articles_filtre_idx on public.articles (nature, type_fonction, couleur, montage);
create trigger t_articles_touch before update on public.articles
  for each row execute function public.touch_updated_at();

-- --- Ensembles préconfigurés : ce que l'ouvrier voit et clique -------
-- « Prise T13 double » = 1 ensemble ; la couleur est une variante ;
-- chaque variante éclate en 2-3 références réelles (appareil + plaque + cadre).
create table public.ensembles (
  id            uuid primary key default gen_random_uuid(),
  libelle       text not null,               -- « Prise T13 double »
  type_fonction text,
  montage       text check (montage in ('encastre','apparent')),
  dimension     text,
  icone         text,
  favori        boolean not null default false,   -- les 30-40 du quotidien
  ordre         smallint not null default 0,
  actif         boolean not null default true,
  updated_at    timestamptz not null default now()
);
create index ensembles_favoris_idx on public.ensembles (favori, ordre) where actif;
create trigger t_ensembles_touch before update on public.ensembles
  for each row execute function public.touch_updated_at();

create table public.ensemble_variantes (
  id          uuid primary key default gen_random_uuid(),
  ensemble_id uuid not null references public.ensembles(id) on delete cascade,
  couleur     text not null,
  actif       boolean not null default true,
  unique (ensemble_id, couleur)
);

-- L'éclatement en références individuelles pour la commande grossiste
create table public.ensemble_lignes (
  id          uuid primary key default gen_random_uuid(),
  variante_id uuid not null references public.ensemble_variantes(id) on delete cascade,
  article_id  uuid not null references public.articles(id) on delete restrict,
  quantite    numeric(10,2) not null default 1,
  unique (variante_id, article_id)
);

-- =====================================================================
-- 5. LISTE DE MATÉRIEL  (journal append-only — cf. principe 4)
-- =====================================================================
create table public.materiel_commandes (
  id         uuid primary key,
  affaire_id uuid not null references public.affaires(id) on delete cascade,
  cree_par   uuid references public.profils(id),
  created_at timestamptz not null default now(),
  exporte_le timestamptz,
  note       text
);

create table public.materiel_mouvements (
  id           uuid primary key,             -- généré côté client = clé d'idempotence
  affaire_id   uuid not null references public.affaires(id) on delete cascade,
  variante_id  uuid references public.ensemble_variantes(id),
  article_id   uuid references public.articles(id),   -- article hors ensemble
  quantite     numeric(10,2) not null,        -- >0 ajout, <0 correction
  note         text,
  auteur_id    uuid not null references public.profils(id),
  commande_id  uuid references public.materiel_commandes(id),  -- null = pas encore commandé
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  supprime_le  timestamptz,
  constraint materiel_cible_unique check (num_nonnulls(variante_id, article_id) = 1)
);
create index materiel_affaire_idx on public.materiel_mouvements (affaire_id, created_at desc);
create index materiel_sync_idx on public.materiel_mouvements (updated_at);
create index materiel_a_commander_idx on public.materiel_mouvements (affaire_id)
  where commande_id is null;
create trigger t_materiel_touch before update on public.materiel_mouvements
  for each row execute function public.touch_updated_at();

-- Ce que le chef voit : le cumul par affaire / article / couleur
create view public.materiel_besoins as
  select affaire_id,
         variante_id,
         article_id,
         sum(quantite)   as quantite,
         max(created_at) as derniere_demande,
         bool_or(commande_id is null) as a_commander
  from public.materiel_mouvements
  where supprime_le is null
  group by affaire_id, variante_id, article_id
  having sum(quantite) <> 0;

-- La liste de matériel telle que Nathan la lit et l'exporte.
-- Décision du 21.08 : la liste est POUR LUI, pas pour le grossiste — donc une
-- ligne par article complet, avec son numéro ELDAS®. `ensemble_lignes` ne porte
-- qu'une ligne par variante (l'article complet). Le jour où une combinaison
-- multiple demande plusieurs références, on en ajoute et la vue suit toute seule.
-- `ref_manquante` = article sans numéro ELDAS : à signaler en rouge dans l'UI.
create view public.materiel_export as
  select b.affaire_id,
         a.e_no as no_eldas,
         a.ref_fabricant, a.marque, a.gamme, a.designation, a.couleur,
         sum(b.quantite * coalesce(el.quantite, 1)) as quantite,
         (a.e_no is null) as ref_manquante
  from public.materiel_besoins b
  left join public.ensemble_lignes el on el.variante_id = b.variante_id
  join public.articles a on a.id = coalesce(el.article_id, b.article_id)
  group by 1, 2, 3, 4, 5, 6, 7, 9;

-- =====================================================================
-- 6. MÉTRÉS
-- =====================================================================
-- Nomenclature de métré (postes CAN/USIE) — réutilisable depuis ~/metre-elec
-- (184 postes déjà rédigés, data/nomenclature.csv). Voir QUESTION 1 du plan.
create table public.postes (
  id         uuid primary key default gen_random_uuid(),
  categorie  text not null,                  -- ECL, PRI, FOR, CMD, CF, BUS, TAB, TUB, APP, DIV
  code       text not null unique,           -- ECL-VV, PRI-T13…
  libelle    text not null,
  unite      text not null default 'pce' check (unite in ('pce','m','h')),
  no_can     text,                           -- 9 chiffres CCC GGG VVV si connu
  notes      text,
  ordre      int not null default 0,
  actif      boolean not null default true,
  updated_at timestamptz not null default now()
);
create index postes_cat_idx on public.postes (categorie, ordre) where actif;

-- Découpage du métré par niveau + local (décision arrêtée).
-- Un jeu de locaux types est proposé à la création d'un chantier ; on peut
-- toujours en ajouter un sur le terrain. `local_id` reste nullable côté ligne :
-- un dépannage n'a pas forcément de découpage.
create table public.locaux (
  id          uuid primary key,
  affaire_id  uuid not null references public.affaires(id) on delete cascade,
  niveau      text,                          -- Sous-sol, RDC, 1er…
  nom         text not null,                 -- Cuisine, Ch. 1…
  ordre       smallint not null default 0,
  updated_at  timestamptz not null default now(),
  supprime_le timestamptz
);
create index locaux_affaire_idx on public.locaux (affaire_id, ordre);
create unique index locaux_unicite_idx on public.locaux (affaire_id, coalesce(niveau, ''), nom)
  where supprime_le is null;

-- Locaux types proposés en un tap à la création d'une affaire
create table public.locaux_types (
  id      uuid primary key default gen_random_uuid(),
  famille text not null,                   -- LOGEMENT | TERTIAIRE | INDUSTRIEL
  niveau  text,
  nom     text not null,
  ordre   smallint not null default 0
);
create unique index locaux_types_unicite_idx
  on public.locaux_types (famille, coalesce(niveau, ''), nom);
create trigger t_locaux_touch before update on public.locaux
  for each row execute function public.touch_updated_at();

create table public.metres (
  id          uuid primary key,
  affaire_id  uuid not null references public.affaires(id) on delete cascade,
  libelle     text not null default 'Métré',
  statut      text not null default 'brouillon'
              check (statut in ('brouillon','valide','transmis_bureau')),
  cree_par    uuid references public.profils(id),
  valide_par  uuid references public.profils(id),
  valide_le   timestamptz,
  transmis_le timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  supprime_le timestamptz
);
create index metres_affaire_idx on public.metres (affaire_id, statut);
create index metres_sync_idx on public.metres (updated_at);
create trigger t_metres_touch before update on public.metres
  for each row execute function public.touch_updated_at();

-- Une ligne de métré pointe SOIT sur un poste CAN, SOIT sur un article catalogue
-- (décision arrêtée : les deux, au choix de la ligne). L'export groupe donc en
-- deux blocs : « Postes » d'abord (ce que le bureau chiffre), « Articles » ensuite.
create table public.metre_lignes (
  id          uuid primary key,
  metre_id    uuid not null references public.metres(id) on delete cascade,
  poste_id    uuid references public.postes(id),      -- métré CAN
  article_id  uuid references public.articles(id),    -- ou article catalogue
  local_id    uuid references public.locaux(id) on delete set null,
  quantite    numeric(10,2) not null default 1,
  ci          text,                                   -- code d'installation (2 chiffres)
  note        text,
  auteur_id   uuid references public.profils(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  supprime_le timestamptz,
  constraint metre_cible_unique check (num_nonnulls(poste_id, article_id) = 1)
);
create index metre_lignes_metre_idx on public.metre_lignes (metre_id);
create index metre_lignes_sync_idx on public.metre_lignes (updated_at);
create trigger t_metre_lignes_touch before update on public.metre_lignes
  for each row execute function public.touch_updated_at();

-- Un métré validé/transmis se fige : seul le chef peut encore le toucher
create or replace function public.protege_metre_fige()
returns trigger language plpgsql as $fn$
declare s text;
begin
  select statut into s from public.metres
   where id = coalesce(new.metre_id, old.metre_id);
  if s <> 'brouillon' and not public.est_chef() then
    raise exception 'Métré déjà validé — modification réservée au chef';
  end if;
  return new;
end $fn$;
create trigger t_metre_lignes_fige before insert or update on public.metre_lignes
  for each row execute function public.protege_metre_fige();

-- Seul le chef peut faire avancer le statut
create or replace function public.protege_statut_metre()
returns trigger language plpgsql as $fn$
begin
  if new.statut is distinct from old.statut and not public.est_chef() then
    raise exception 'Seul le chef peut valider ou transmettre un métré';
  end if;
  return new;
end $fn$;
create trigger t_metres_statut before update on public.metres
  for each row execute function public.protege_statut_metre();

-- =====================================================================
-- 7. RLS
-- =====================================================================
alter table public.profils             enable row level security;
alter table public.affaires            enable row level security;
alter table public.affectations        enable row level security;
alter table public.etapes              enable row level security;
alter table public.articles            enable row level security;
alter table public.ensembles           enable row level security;
alter table public.ensemble_variantes  enable row level security;
alter table public.ensemble_lignes     enable row level security;
alter table public.materiel_commandes  enable row level security;
alter table public.materiel_mouvements enable row level security;
alter table public.postes              enable row level security;
alter table public.locaux              enable row level security;
alter table public.locaux_types        enable row level security;
alter table public.metres              enable row level security;
alter table public.metre_lignes        enable row level security;

-- Profils : chacun se lit, le chef lit tout le monde
create policy profils_select on public.profils for select
  using (id = auth.uid() or public.est_chef());
create policy profils_update on public.profils for update
  using (id = auth.uid() or public.est_chef());

-- Référentiels : lecture pour tous les connectés, écriture réservée au chef
create policy articles_lecture on public.articles for select to authenticated using (true);
create policy articles_ecriture on public.articles for all to authenticated
  using (public.est_chef()) with check (public.est_chef());

create policy ensembles_lecture on public.ensembles for select to authenticated using (true);
create policy ensembles_ecriture on public.ensembles for all to authenticated
  using (public.est_chef()) with check (public.est_chef());

create policy variantes_lecture on public.ensemble_variantes for select to authenticated using (true);
create policy variantes_ecriture on public.ensemble_variantes for all to authenticated
  using (public.est_chef()) with check (public.est_chef());

create policy ens_lignes_lecture on public.ensemble_lignes for select to authenticated using (true);
create policy ens_lignes_ecriture on public.ensemble_lignes for all to authenticated
  using (public.est_chef()) with check (public.est_chef());

create policy postes_lecture on public.postes for select to authenticated using (true);
create policy postes_ecriture on public.postes for all to authenticated
  using (public.est_chef()) with check (public.est_chef());

create policy locaux_types_lecture on public.locaux_types for select to authenticated using (true);
create policy locaux_types_ecriture on public.locaux_types for all to authenticated
  using (public.est_chef()) with check (public.est_chef());

-- Affaires : chef = tout ; ouvrier = ses affectations
create policy affaires_select on public.affaires for select
  using (public.acces_affaire(id));
create policy affaires_insert on public.affaires for insert
  with check (public.est_chef());
create policy affaires_update on public.affaires for update
  using (public.acces_affaire(id)) with check (public.acces_affaire(id));

create policy affectations_select on public.affectations for select
  using (profil_id = auth.uid() or public.est_chef());
create policy affectations_ecriture on public.affectations for all
  using (public.est_chef()) with check (public.est_chef());

-- Tables filles : accès hérité de l'affaire
create policy etapes_acces on public.etapes for all to authenticated
  using (public.acces_affaire(affaire_id)) with check (public.acces_affaire(affaire_id));

create policy locaux_acces on public.locaux for all to authenticated
  using (public.acces_affaire(affaire_id)) with check (public.acces_affaire(affaire_id));

create policy metres_acces on public.metres for all to authenticated
  using (public.acces_affaire(affaire_id)) with check (public.acces_affaire(affaire_id));

create policy materiel_mvt_acces on public.materiel_mouvements for all to authenticated
  using (public.acces_affaire(affaire_id)) with check (public.acces_affaire(affaire_id));

create policy materiel_cmd_acces on public.materiel_commandes for all to authenticated
  using (public.acces_affaire(affaire_id)) with check (public.acces_affaire(affaire_id));

create policy metre_lignes_acces on public.metre_lignes for all to authenticated
  using (exists (select 1 from public.metres m
                 where m.id = metre_id and public.acces_affaire(m.affaire_id)))
  with check (exists (select 1 from public.metres m
                 where m.id = metre_id and public.acces_affaire(m.affaire_id)));
