# -*- coding: utf-8 -*-
"""
Génère les données de seed de l'app depuis les sources CSV.

Sources de vérité (ne jamais éditer les JSON générés à la main) :
  - ~/metre-elec/data/*.csv                     nomenclature de métré, locaux types
  - ~/app-chantier/data/ensembles-favoris-eclatement.csv   catalogue Feller

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

# Les libellés du CSV sont sans accents (contrainte d'export). Ce sont eux que
# l'ouvrier lit sur son téléphone : ils passent en français correct ici.
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
    'Combinaison interrupteur 3/1P + prise T13': 'Interrupteur 3/1P + prise T13',
    'Interrupteur schema 1/3+3/1P (double)': 'Interrupteur schéma 1 (double)',
    'Interrupteur schema 3 (va-et-vient)': 'Interrupteur schéma 3 (va-et-vient)',
    'Interrupteur schema 6 (croisement)': 'Interrupteur schéma 6 (croisement)',
    'Interrupteur schema 3/2 (double va-et-vient)': 'Interrupteur schéma 3/2 (double VV)',
    'Poussoir A-R simple': 'Poussoir A-R',
    'Poussoir 2x A-R / 1P': 'Poussoir 2× A-R / 1P',
    'Poussoir A-R (schema 9)': 'Poussoir A-R (schéma 9)',
    'Plaque d obturation 88x88': "Plaque d'obturation",
    'Obturateur sans vis centrale': 'Obturateur sans vis centrale',
}

COULEURS = {'gris fonce': 'gris foncé'}

CATEGORIES_ENSEMBLE = {
    'PRISE': 'Prises',
    'INTER': 'Interrupteurs',
    'POUSS': 'Poussoirs',
    'COMBI': 'Combinaisons',
    'OBTUR': 'Obturation',
}


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
    print('  %-16s %4d entrees  %3d Ko' % (nom + '.json', len(obj), os.path.getsize(chemin) // 1024))


def main():
    os.makedirs(SORTIE, exist_ok=True)

    categories = [
        {'code': c[0], 'libelle': c[1], 'ordre': int(c[2]), 'couleur': c[3]}
        for c in lire_pipe(os.path.join(METRE_ELEC, 'categories.csv'))
    ]

    postes = []
    for i, r in enumerate(lire_pipe(os.path.join(METRE_ELEC, 'nomenclature.csv'))):
        postes.append({
            'categorie': r[0], 'code': r[1], 'libelle': r[2],
            'unite': r[3] or 'pce',
            'schema': (r[4] if len(r) > 4 else '') or None,
            'notes': (r[5] if len(r) > 5 else '') or None,
            'ordre': (i + 1) * 10,
        })

    locaux = [
        {'famille': r[0], 'nom': r[1], 'ordre': int(r[2])}
        for r in lire_pipe(os.path.join(METRE_ELEC, 'locaux_types.csv'))
    ]

    source = os.path.join(DONNEES, 'ensembles-favoris-eclatement.csv')
    rows = list(csv.DictReader(io.open(source, encoding='utf-8-sig'), delimiter=';'))

    ensembles, articles = {}, {}
    for r in rows:
        libelle = LIBELLES.get(r['ensemble'], r['ensemble'])
        couleur = COULEURS.get(r['couleur'], r['couleur'])
        e = ensembles.setdefault(libelle, {
            'libelle': libelle,
            'categorie': CATEGORIES_ENSEMBLE.get(r['categorie'], r['categorie']),
            'montage': 'encastre', 'favori': True, 'ordre': len(ensembles) * 10,
            'variantes': [],
        })
        if any(v['couleur'] == couleur for v in e['variantes']):
            continue
        articles[r['e_no_complet']] = {
            'e_no': r['e_no_complet'], 'ref_fabricant': r['fnr_complet'],
            'marque': 'Feller', 'gamme': 'EDIZIOdue',
            'designation': r['designation_complet'], 'nature': 'appareil',
            'montage': 'encastre', 'couleur': couleur, 'dimension': '1x1',
        }
        e['variantes'].append({
            'couleur': couleur, 'code_couleur': r['code_couleur'], 'e_no': r['e_no_complet'],
        })

    inconnus = {r['ensemble'] for r in rows} - set(LIBELLES)
    if inconnus:
        print('  ATTENTION, libelles sans traduction :', sorted(inconnus))

    print('Seed genere :')
    ecrire('categories', categories)
    ecrire('postes', postes)
    ecrire('locaux-types', locaux)
    ecrire('ensembles', list(ensembles.values()))
    ecrire('articles', list(articles.values()))


if __name__ == '__main__':
    main()
