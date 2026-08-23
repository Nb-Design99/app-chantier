# App chantier électrique — Plan de build V1

> Version 0.2 — 21.08.2026. Les 4 questions ouvertes ont été tranchées (§6).
> Schéma SQL associé : `supabase/migrations/0001_schema_v1.sql`

---

## 1. Périmètre V1 (et ce qui en est explicitement exclu)

**Dedans**
- Affaires (3 types) + affectations chef/ouvrier
- Checklist des 6 étapes, cochables, avec note libre
- Catalogue : favoris (30-40 ensembles) + recherche dans le catalogue complet
- Liste de matériel par affaire, cumulée, exportable pour le grossiste
- Métrés : saisie terrain → validation chef → transmis bureau, export PDF + Excel
- Mode hors ligne complet (lecture **et** écriture) + sync automatique

**Dehors (V2/V3, mais le schéma ne les bloque pas)**
- Planning et report automatique · Documents / plans PDF · Notifications push
- Recherche NIBT (RAG) · État des lieux photo · Recherche globale

> ⚠️ La notification push au chef à chaque demande de matériel est listée en V1
> dans le cahier des charges mais en V2 dans les priorités. Je l'ai mise en V2.
> En V1, le chef voit un **badge « nouvelles demandes »** à l'ouverture de l'app :
> zéro infra, 90 % de la valeur.

---

## 2. Choix de stack — ma recommandation

| Question | Réponse | Pourquoi |
|---|---|---|
| Astro ou Next.js ? | **Ni l'un ni l'autre : Vite + React, SPA pure** ✅ validé | L'app est 100 % dynamique et derrière un login. Astro sert à générer des pages statiques (son intérêt = le SEO, le contenu) : ici tout serait dans une île client, donc Astro n'apporte rien. Next.js apporte du SSR, inutile hors ligne et pénible sur Cloudflare Pages. Une SPA compilée en fichiers statiques est **exactement** ce que Cloudflare Pages sert le mieux, et c'est la seule forme qui marche vraiment sans réseau. |
| Hors ligne | **PWA + IndexedDB (Dexie) + file d'attente maison** | On écrit d'abord en local, toujours. Un « outbox » rejoue les opérations quand le réseau revient. Alternative PowerSync/ElectricSQL : payant ou lourd, injustifié pour 3 utilisateurs. |
| UI | Tailwind + composants maison, cibles tactiles ≥ 56 px | Mains sales, gants, plein soleil. |
| Exports | PDF via `pdf-lib`, Excel via `SheetJS`, **générés côté client** | Marchent hors ligne, pas de fonction serveur à maintenir. |
| Auth | Supabase Auth, e-mail + mot de passe, comptes créés par toi | 3 personnes. Pas d'inscription publique. Session longue durée (refresh token 30 j) sinon l'ouvrier se fait déconnecter au fond d'un sous-sol. |

**⚠️ Prérequis bloquant : Node.js n'est pas installé sur ton PC.** Il faut
l'installer avant la première ligne de code (`winget install OpenJS.NodeJS.LTS`).
Je peux le faire, mais ça demande ton accord — l'install touche le système.

---

## 3. Le schéma en une page

```
profils (chef | ouvrier)
   │
   ├── affectations ──────┐
   │                      │
affaires (chantier | depannage | remise_conformite)
   ├── etapes            6 lignes auto-créées si type = chantier
   ├── locaux            niveau + nom  (proposés depuis locaux_types)
   ├── metres ── metre_lignes ── poste_id → postes      (nomenclature CAN)
   │                          ├─ ou article_id → articles
   │                          └─ local_id → locaux
   ├── materiel_mouvements ── variante_id → ensemble_variantes
   └── materiel_commandes

CATALOGUE (référentiel partagé, écriture chef only)
   articles          e_no, ref, désignation, nature, couleur, dimension…
   ensembles         « Prise T13 double »      ← ce que l'ouvrier clique
     └ ensemble_variantes (couleur)
         └ ensemble_lignes → articles          ← l'éclatement pour la commande
   postes            nomenclature de métré
```

### Les 5 décisions de schéma qui comptent

**a) Appareil / plaque / cadre → résolu par `ensembles`.**
L'ouvrier clique « Prise T13 double blanche » (1 ligne). À l'export commande, la
vue `materiel_export` fait le join et sort les références Feller réelles avec
leurs quantités. Le jour où tu ajoutes une autre marque, tu ajoutes des articles :
aucune table ne change.
*Confirmé par les données (21.08) : un appareil EDIZIOdue simple éclate en
**2** références, pas 3 — un intérieur (`.BSM`, sans couleur) + un kit frontal
(`920-…`, avec la couleur). L'intérieur étant identique dans les 6 couleurs, la
structure `ensembles → variantes(couleur) → lignes(articles)` tombe juste.*

**b) Le matériel est un journal, pas un compteur.**
`materiel_mouvements` est append-only : « +2 prises T13 blanches, par Nils, à 9h12 ».
La vue `materiel_besoins` fait la somme. C'est *la* décision qui rend le hors ligne
correct : deux téléphones déconnectés qui ajoutent 3 et 2 donnent 5. Avec un champ
`quantite` qu'on écrase, le dernier à se synchroniser efface l'autre. Bonus gratuit :
on sait qui a demandé quoi et quand, et une correction se fait avec `-1`.

**c) Ids générés côté client + soft-delete + `updated_at` serveur.**
Les trois ensemble suffisent à faire une sync bidirectionnelle simple : je pousse
mon outbox, je tire tout ce qui a bougé depuis mon dernier passage. Sans
soft-delete, une suppression est invisible pour un téléphone resté hors ligne.

**d) Le statut du métré est protégé par trigger, pas seulement par l'UI.**
Un ouvrier ne peut pas passer un métré en `valide`, et un métré validé se fige.
Ça évite qu'une sync tardive d'un brouillon écrase un métré déjà parti au bureau.

**e) RLS dès le jour 1.**
Deux fonctions `security definer` (`est_chef()`, `acces_affaire()`) et toutes les
policies en découlent. Coût : 2 h. Le faire après coup : 2 jours.

**f) Le numéro E est nullable, et c'est assumé.**
Filet de sécurité pour tout article ajouté à la main : il est utilisable en saisie
terrain sans numéro E, mais la vue `materiel_export` sort une colonne
`ref_manquante` → l'écran de commande affiche la ligne en rouge et **refuse
l'envoi tant qu'il en reste**.
*Devenu accessoire depuis le 21.08 : les 11 177 références EDIZIOdue sont
récupérées avec leurs numéros E (cf. `data/README.md`).*

### Ce qu'on réutilise de `~/metre-elec`
La nomenclature de métré y est déjà rédigée : **184 postes, 10 catégories**, dans
`data/nomenclature.csv`, plus un script de génération et un schéma Postgres archivé
dans `archive/postgres/`. La table `postes` ci-dessus est volontairement compatible
→ le seed du métré, c'est 1 h, pas 3 jours. Les locaux types (`locaux_types`)
viennent du même endroit (`data/locaux_types.csv`).

---

## 4. Plan de build — 10 étapes, ~11.5 jours de dev

| # | Étape | Contenu | Durée |
|---|---|---|---|
| 0 | **Fondations** | Node.js, repo git, projet Supabase, Cloudflare Pages, squelette Vite+React+Tailwind, déploiement d'une page blanche pour valider la chaîne | 0.5 j |
| 1 | **Schéma + RLS** | La migration ci-jointe, les 3 comptes, tests des policies (un ouvrier ne doit voir que ses affaires) | 1 j |
| 2 | **Seed référentiels** | Import des 184 postes de métré + des locaux types depuis `~/metre-elec`, et du catalogue Feller depuis `data/` (déjà extrait). Écran d'admin pour ajuster les favoris | 0.5 j |
| 3 | **Couche hors ligne** | Dexie, outbox, sync push/pull, indicateur « X modifications en attente ». **C'est la brique la plus dure — elle passe en premier, tout le reste s'appuie dessus** | 2 j |
| 4 | **Auth + coquille mobile** | Login, navigation par onglets, liste des affaires, création d'affaire (chef) | 1 j |
| 5 | **Affaires + étapes** | Détail d'une affaire, checklist cochable, note par étape, dates | 0.5 j |
| 6 | **Matériel** | Grille de favoris → couleur → quantité. **Objectif : 3 taps montre en main.** Vue cumulée chef, badge nouvelles demandes, export commande | 1.5 j |
| 7 | **Métrés** | Niveaux + locaux, saisie ligne par ligne (poste CAN **ou** article), recherche, tri alphabétique côté chef, validation, passage à transmis | 2 j |
| 8 | **Exports** | PDF + Excel du métré, Excel/CSV de la commande matériel, partage natif du téléphone | 1 j |
| 9 | **Durcissement terrain** | Install PWA sur les 3 téléphones, **test réel en mode avion**, coupures en pleine saisie, batterie, gros doigts | 1 j |

**Séquencement volontaire :** hors ligne en étape 3, avant toute fonctionnalité.
Ajouter le mode hors ligne à une app déjà écrite en ligne, c'est la réécrire.

### Où on en est — 21.08.2026

Le squelette est monté **en mode 100 % local**, sans Supabase, et il tourne :
`node.exe … vite` sur <http://localhost:5180> (config `app-chantier` du launch.json).

| Étape | État |
|---|---|
| 0 Fondations | ✅ sauf hébergement (rien à héberger pour l'instant) |
| 1 Schéma + RLS | 🟡 SQL écrit, **jamais exécuté sur un vrai Postgres** |
| 2 Seed référentiels | ✅ 184 postes, 47 locaux types, 21 ensembles, 126 articles |
| 3 Couche hors ligne | 🟡 base locale + file d'attente ✅ ; la synchro reste à écrire |
| 4 Auth + coquille | 🟡 coquille ✅ ; auth simulée par un sélecteur de profil |
| 5 Affaires + étapes | ✅ testé, note libre comprise |
| 6 Matériel | ✅ **1 tap = +1** (mieux que les 3 clics demandés) |
| 7 Métrés | ✅ recherche, locaux, validation, figeage |
| 8 Exports | 🟡 CSV matériel ✅ ; PDF/Excel du métré à faire |
| 9 Durcissement terrain | ⬜ demande les vrais téléphones |

**Ce qui ne sera pas à refaire au branchement de Supabase :** aucun écran. Les
écrans lisent et écrivent dans la base locale, `src/db/repo.ts` dépose une
opération dans `sync_file` à chaque écriture, et `src/sync/index.ts` est le seul
fichier qui parlera au serveur. Le schéma Dexie est le miroir exact du SQL — c'est
la seule chose à maintenir en phase entre les deux.

**Ce qui restera à faire :** écrire `pousser()` / `tirer()`, remplacer le sélecteur
de profil par Supabase Auth (le reste du code ne connaît qu'un `profil.id`),
et éprouver la RLS pour de vrai.

**Jalon utile à mi-parcours :** après l'étape 6, l'app est déjà utilisable sur un
vrai chantier pour le matériel seul. Ça vaut la peine de la faire tourner une
semaine avant d'attaquer les métrés — les retours terrain changeront l'écran de métré.

---

## 5. Deux points de vigilance

**Le « < 3 clics » est un critère de test, pas un vœu.** Chronomètre à l'étape 6 :
depuis l'écran d'accueil, ajouter une prise T13 blanche à l'affaire en cours =
3 taps max. Si la couleur par défaut de l'affaire est mémorisée, on tombe à 2.

**Le hors ligne n'est pas gratuit.** Deux limites à accepter dès maintenant :
la modification d'une même ligne de métré par deux personnes déconnectées se règle
en « le dernier qui synchronise gagne » (acceptable : un ouvrier par affaire) ; et
il faut décider ce qui est mis en cache (proposition : toutes les affaires actives
+ tout le catalogue ≈ quelques Mo, donc tout).

---

## 6. Décisions arrêtées (21.08.2026)

| Sujet | Décision | Conséquence sur le schéma |
|---|---|---|
| Nature d'une ligne de métré | **Poste CAN *ou* article, au choix de la ligne** | `metre_lignes` a `poste_id` et `article_id`, avec une contrainte « un seul des deux ». L'export sort en deux blocs : Postes, puis Articles. |
| Catalogue Feller | **Extrait du catalogue en ligne Feller le 21.08.2026** — 11 177 références EDIZIOdue avec numéros E, plus l'éclatement officiel des 21 ensembles du quotidien. Voir `data/README.md` | `articles.e_no` reste nullable (filet pour les ajouts manuels), vue `materiel_export.ref_manquante` |
| Découpage du métré | **Par niveau + local** | Tables `locaux` et `locaux_types`, `metre_lignes.local_id` |
| Liste de matériel | **Pour Nathan, pas pour le grossiste** : 1 ligne par article complet, avec son **numéro ELDAS®** | `ensemble_lignes` = 1 ligne par variante ; vue `materiel_export` expose `no_eldas` |
| Framework | **Vite + React, SPA statique** | — |

## 7. Ce qu'il me faut de ta part

1. **Valider / corriger la liste des 21 ensembles** proposée dans `data/README.md`.
   C'est mon tronc commun logement, pas ta liste : retire ce que vous ne posez pas,
   ajoute ce qui manque (variateurs, détecteurs, thermostats, prises AP, KNX…).
   Tout est disponible dans `feller-ediziodue-complet.csv`.
2. **Les couleurs réellement posées.** J'ai gardé les 6 qui existent en EDIZIOdue
   (blanc, noir, crema, gris clair, gris foncé, coffee). Si vous n'en posez que 2,
   la grille de favoris est deux fois plus rapide à l'usage.
3. ~~Commande = article complet ou composants ?~~ **Tranché** : article complet,
   1 ligne, avec son **numéro ELDAS®**. La liste est pour Nathan, pas pour le
   grossiste.
4. ~~Feu vert Node.js~~ **Donné le 21.08.**
