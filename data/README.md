# Données catalogue Feller — source et méthode

## Ce qu'il y a dans ce dossier

| Fichier | Contenu | Lignes |
|---|---|---|
| `feller-ediziodue-complet.csv` | **Tout** l'assortiment EDIZIOdue (colore + prestige + elegance), toutes couleurs, avec numéro Feller, numéro E (ELDAS®), désignation française, EAN et article de suivi SNAPFIX® | 11 177 |
| `ensembles-favoris-eclatement.csv` | Les 21 ensembles du quotidien × 6 couleurs, **avec leur éclatement réel** en intérieur + kit frontal | 252 |

## D'où ça vient

Catalogue en ligne public de Feller : <https://online-katalog.feller.ch>.
Le site est une SPA qui interroge une API JSON non authentifiée :

```
GET /products/query?lng=fr&page=1&perPage=50&filters={"-1":[4351,4478,4653]}
GET /products/{numeroFeller}?lng=fr
```

- `filters` est un JSON encodé, indexé par groupe de filtre :
  `-1` design · `-2` type de montage · `-3` couleur · `-4` utilisation · `-5` fixation.
  Les identifiants viennent de `GET /products/filters?lng=fr`.
- Design EDIZIOdue : `4351` colore · `4478` prestige · `4653` elegance.
- `perPage` est plafonné à **50**.
- Chaque article renvoyé embarque un tableau `similar[]` = toutes ses déclinaisons
  de couleur, chacune avec son propre numéro E. C'est ce qui permet de récupérer
  l'assortiment complet sans parcourir chaque couleur séparément.
- La fiche produit (`/products/{fnr}`) renvoie `disassembleItems[]` = **l'éclatement
  officiel** de l'article complet en ses composants.

Codes couleur (suffixe du numéro Feller) : `61` blanc · `60` noir · `35` crema ·
`65` gris clair · `67` gris foncé · `57` coffee. Le `69` graphite foncé **n'existe
pas** en EDIZIOdue.

> ⚠️ Extraction du 21.08.2026, pas de garantie de fraîcheur. Le catalogue Feller
> reste la source de vérité — prévoir de relancer l'extraction avant une mise en
> production, et de la rejouer périodiquement.
> Les **prix ne sont pas repris** : hors périmètre de l'app (le bureau chiffre).

## Ce que les données ont appris sur le modèle

Le cahier des charges partait de *« appareil, plaque de recouvrement et cadre sont
3 références distinctes »*. C'est vrai pour les combinaisons multiples, mais pour
un appareil simple EDIZIOdue la réalité est **2 références**, et le catalogue les
donne lui-même :

```
Interrupteur ENC EDIZIOdue 3/1L blanc   →  7563.FMI.61   E-No 226311000
  ├── 1× 7563.BSM         E-No 326317000   Intérieur interrupteur FH BSM 3/1
  └── 1× 920-7560.FMI.61  E-No 378430000   Kit frontal ENC EDIZIOdue blanc 88×88
```

Trois conséquences directes pour l'app :

1. **L'intérieur ne dépend jamais de la couleur.** Vérifié sur les 21 ensembles ×
   6 couleurs : l'intérieur est rigoureusement identique, seul le kit frontal change.
   C'est exactement la structure `ensembles → ensemble_variantes(couleur) →
   ensemble_lignes(articles)` du schéma. Rien à revoir.
2. **L'éclatement n'est pas à saisir à la main.** `disassembleItems[]` le fournit
   pour chaque article : la table `ensemble_lignes` se remplit toute seule.
3. **Le kit frontal est mutualisé.** `7563`, `7566` et `7569` partagent tous
   `920-7560.FMI.xx`. 21 ensembles × 6 couleurs ne donnent que 94 kits frontaux
   distincts — d'où l'intérêt d'une table `articles` séparée plutôt que de
   dupliquer les références dans chaque ensemble.

**Tranché le 21.08 : on retient l'article complet et son numéro ELDAS®.** La liste
de matériel est pour Nathan, pas pour le grossiste — donc `ensemble_lignes` ne
porte qu'une ligne par variante, celle de l'article complet (`87303.FMI.61`,
ELDAS 657115000), et non ses 2 composants.

L'éclatement reste dans `ensembles-favoris-eclatement.csv` : il sert à retrouver
un intérieur ou un kit frontal quand on remplace une pièce seule, et il servira le
jour où une combinaison multiple demandera plusieurs références sur une même ligne.
La colonne `e_no_complet` du fichier est celle à charger dans `articles.e_no`.

## Les 21 ensembles retenus

Prises : T13 simple · T13 shutter · 2×T13 · 2×T13 shutter · 2×T13 dont 1 commutée ·
3×T13 · 3×T13 shutter · 3×T13 dont 1 commutée · T23 16A bornes enfichables ·
T23 16A bornes à vis · T15
Combinaison : interrupteur 3/1P + prise T13
Interrupteurs : schéma 1/3+3/1P · schéma 3 (va-et-vient) · schéma 6 (croisement) ·
schéma 3/2 (double va-et-vient)
Poussoirs : A-R simple · 2×A-R/1P · A-R schéma 9
Obturation : plaque d'obturation 88×88 · obturateur sans vis centrale

Tous en `.FMI` = encastré 88×88 mm, l'appareil seul. La variante `.F` (60×60 mm,
pour combinaisons dans un cadre) existe pour les mêmes fonctions et est présente
dans le fichier complet.

**Cette liste est ma proposition, pas ta liste.** Elle couvre le tronc commun d'une
installation logement ; à toi de retirer ce que vous ne posez pas et d'ajouter ce
qui manque (variateurs, détecteurs, thermostats, prises AP, KNX…). Tout est dans
`feller-ediziodue-complet.csv`.
