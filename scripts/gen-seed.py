# -*- coding: utf-8 -*-
"""
Génère les données de seed de l'app depuis les sources CSV.

Sources de vérité (ne jamais éditer les JSON générés à la main) :
  - ~/metre-elec/data/*.csv                      184 postes de métré, locaux types
  - data/postes-complements.csv                  fils, câbles, canaux, postes en heures
  - data/can-parties-installation.csv            216 positions CAN 583-586
  - data/codes-ci.csv                            codes d'installation USIE
  - data/ensembles-favoris-eclatement.csv        catalogue Feller

Sortie : app/src/data/*.json

Relancer :  python scripts/gen-seed.py
"""
import csv
import io
import json
import os

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
METRE_ELEC = os.path.join(os.path.dirname(RACINE), 'metre-elec', 'data')
DONNEES = os.path.join(RACINE, 'data')
SORTIE = os.path.join(RACINE, 'app', 'src', 'data')

# Les libellés du CSV Feller sont sans accents (contrainte d'export) et suivent
# la désignation constructeur. Ce sont eux que l'ouvrier lit sur son téléphone :
# ils passent ici en notation « schéma », la seule qui parle sur le chantier.
LIBELLES = {
    'Prise T13 simple': 'Prise T13',
    'Prise T13 simple avec shutter': 'Prise T13 avec shutter',
    'Prise 2xT13': 'Prise 2×T13',
    'Prise 2xT13 avec shutter': 'Prise 2×T13 avec shutter',
    'Prise 2xT13 dont 1 commutee': 'Prise 2×T13 dont 1 commutée',
    'Prise 3xT13': 'Prise 3×T13',
    'Prise 3xT13 avec shutter': 'Prise 3×T13 avec shutter',
    'Prise 3xT13 dont 1 commutee': 'Prise 3×T13 dont 1 commutée',
    'Prise T23 16A bornes enfichables': 'Prise T23 16A (bornes enfichables)',
    'Prise T23 16A bornes a vis': 'Prise T23 16A (bornes à vis)',
    'Prise T15': 'Prise T15',
    'Combinaison interrupteur 3/1P + prise T13': 'Inter. sch. 3 + prise T13',
    'Interrupteur schema 1/3+3/1P (double)': 'Inter. sch. 1 / 3+3',
    'Interrupteur schema 3 (va-et-vient)': 'Inter. sch. 3',
    'Interrupteur schema 6 (croisement)': 'Inter. sch. 6',
    'Interrupteur schema 3/2 (double va-et-vient)': 'Inter. sch. 3/2',
    'Poussoir A-R simple': 'Poussoir A-R',
    'Poussoir 2x A-R / 1P': 'Poussoir 2× A-R',
    'Poussoir A-R (schema 9)': 'Poussoir A-R (sch. 9)',
    'Plaque d obturation 88x88': "Plaque d'obturation",
    'Obturateur sans vis centrale': 'Obturateur',
}

COULEURS = {'gris fonce': 'gris foncé'}

CATEGORIES_ENSEMBLE = {
    'PRISE': 'Prises',
    'INTER': 'Interrupteurs',
    'POUSS': 'Poussoirs',
    'COMBI': 'Combinaisons',
    'OBTUR': 'Obturation',
}

# Catégories de métré ajoutées par app-chantier
CATEGORIES_SUP = [
    {'code': 'FIL', 'libelle': 'Fils et câbles', 'ordre': 11, 'couleur': '#0ea5e9'},
    {'code': 'TPS', 'libelle': 'Temps (heures)', 'ordre': 12, 'couleur': '#f43f5e'},
    {'code': 'PI', 'libelle': "Parties d'installation CAN", 'ordre': 13, 'couleur': '#8b5cf6'},
]

# Doublons : ces postes de metre-elec sont remplacés par une version en heures
# ou plus détaillée dans postes-complements.csv.
POSTES_REMPLACES = {'DIV-DEMO'}


def lire_pipe(chemin):
    lignes = []
    for ligne in io.open(chemin, encoding='utf-8'):
        ligne = ligne.rstrip('\n')
        if not ligne.strip() or ligne.lstrip().startswith('#'):
            continue
        lignes.append(ligne.split('|'))
    return lignes


def ecrire(nom, obj):
    chemin = os.path.join(SORTIE, nom + '.json')
    io.open(chemin, 'w', encoding='utf-8').write(json.dumps(obj, ensure_ascii=False, indent=0))
    print('  %-22s %4d entrees  %4d Ko' % (nom + '.json', len(obj), os.path.getsize(chemin) // 1024))


def charger_postes():
    postes, ordre = [], 0
    for r in lire_pipe(os.path.join(METRE_ELEC, 'nomenclature.csv')):
        if r[1] in POSTES_REMPLACES:
            continue
        ordre += 10
        postes.append({
            'categorie': r[0], 'code': r[1], 'libelle': r[2], 'unite': r[3] or 'pce',
            'schema': (r[4] if len(r) > 4 else '') or None,
            'notes': (r[5] if len(r) > 5 else '') or None,
            'no_can': None, 'ordre': ordre,
        })

    for r in lire_pipe(os.path.join(DONNEES, 'postes-complements.csv')):
        ordre += 10
        postes.append({
            'categorie': r[0], 'code': r[1], 'libelle': r[2], 'unite': r[3] or 'pce',
            'schema': (r[4] if len(r) > 4 else '') or None,
            'notes': (r[5] if len(r) > 5 else '') or None,
            'no_can': None, 'ordre': ordre,
        })

    # Parties d'installation CAN : le code EST le numéro CAN, sans espaces.
    src = os.path.join(DONNEES, 'can-parties-installation.csv')
    for r in csv.DictReader(io.open(src, encoding='utf-8-sig'), delimiter=';'):
        ordre += 10
        postes.append({
            'categorie': 'PI', 'code': r['no_can'].replace(' ', ''),
            'libelle': r['designation'], 'unite': 'pce', 'schema': None,
            'notes': 'Chapitre CAN ' + r['chapitre'],
            'no_can': r['no_can'], 'ordre': ordre,
        })
    return postes


def charger_catalogue():
    """Ensembles Feller (avec couleur) + fils/câbles génériques (sans couleur)."""
    src = os.path.join(DONNEES, 'ensembles-favoris-eclatement.csv')
    rows = list(csv.DictReader(io.open(src, encoding='utf-8-sig'), delimiter=';'))

    ensembles, articles = {}, {}
    for r in rows:
        libelle = LIBELLES.get(r['ensemble'], r['ensemble'])
        couleur = COULEURS.get(r['couleur'], r['couleur'])
        e = ensembles.setdefault(libelle, {
            'libelle': libelle,
            'categorie': CATEGORIES_ENSEMBLE.get(r['categorie'], r['categorie']),
            'unite': 'pce', 'sansCouleur': False,
            'favori': True, 'ordre': len(ensembles) * 10, 'variantes': [],
        })
        if any(v['couleur'] == couleur for v in e['variantes']):
            continue
        ref = r['fnr_complet']
        articles[ref] = {
            'ref': ref, 'e_no': r['e_no_complet'], 'marque': 'Feller', 'gamme': 'EDIZIOdue',
            'designation': r['designation_complet'], 'unite': 'pce', 'couleur': couleur,
        }
        e['variantes'].append({'couleur': couleur, 'ref': ref})

    inconnus = {r['ensemble'] for r in rows} - set(LIBELLES)
    if inconnus:
        print('  ATTENTION, libelles Feller sans traduction :', sorted(inconnus))

    # Fils, câbles et canaux : pas de déclinaison de couleur, comptés au mètre.
    # Pas de numéro ELDAS connu — l'app les signalera comme à compléter.
    ordre = len(ensembles) * 10
    for r in lire_pipe(os.path.join(DONNEES, 'postes-complements.csv')):
        cat, code, libelle, unite = r[0], r[1], r[2], r[3]
        if cat not in ('FIL', 'TUB'):
            continue
        ordre += 10
        articles[code] = {
            'ref': code, 'e_no': '', 'marque': 'Générique', 'gamme': '',
            'designation': libelle, 'unite': unite, 'couleur': '',
        }
        ensembles[libelle] = {
            'libelle': libelle,
            'categorie': 'Fils et câbles' if cat == 'FIL' else 'Canaux',
            'unite': unite, 'sansCouleur': True,
            'favori': True, 'ordre': ordre,
            'variantes': [{'couleur': '', 'ref': code}],
        }

    return list(ensembles.values()), list(articles.values())


def main():
    os.makedirs(SORTIE, exist_ok=True)

    categories = [
        {'code': c[0], 'libelle': c[1], 'ordre': int(c[2]), 'couleur': c[3]}
        for c in lire_pipe(os.path.join(METRE_ELEC, 'categories.csv'))
    ] + CATEGORIES_SUP

    locaux = [
        {'famille': r[0], 'nom': r[1], 'ordre': int(r[2])}
        for r in lire_pipe(os.path.join(METRE_ELEC, 'locaux_types.csv'))
    ]

    codes_ci = [
        {'code': r[0], 'groupe': r[1], 'conditions': r[2], 'libelle': r[3], 'exemples': r[4]}
        for r in lire_pipe(os.path.join(DONNEES, 'codes-ci.csv'))
    ]

    postes = charger_postes()
    ensembles, articles = charger_catalogue()

    print('Seed genere :')
    ecrire('categories', categories)
    ecrire('postes', postes)
    ecrire('locaux-types', locaux)
    ecrire('codes-ci', codes_ci)
    ecrire('ensembles', ensembles)
    ecrire('articles', articles)

    par_cat = {}
    for p in postes:
        par_cat[p['categorie']] = par_cat.get(p['categorie'], 0) + 1
    print('  postes par categorie :', ' '.join('%s=%d' % kv for kv in sorted(par_cat.items())))


if __name__ == '__main__':
    main()
