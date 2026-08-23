# -*- coding: utf-8 -*-
"""
Extrait les « parties d'installation » du CAN (chapitres 583 à 586) depuis le
document Word compilé sur le Bureau, vers data/can-parties-installation.csv.

Ce sont les positions « lignes toutes prestations comprises » — celles qui
remplissent la colonne « N° USIE / CAN » de la fiche OIKEN.

Relancer :  python scripts/extraire-can-parties.py
"""
import csv
import html
import io
import os
import re
import shutil
import tempfile
import zipfile

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Copie locale de « ~/OneDrive/Bureau/CAN - Numeros et designations.docx ».
# Python n'a pas accès aux chemins OneDrive dans cet environnement, et une copie
# figée dans le dépôt rend de toute façon l'extraction reproductible.
SOURCE = os.path.join(RACINE, 'data', 'sources', 'can-numeros-designations.docx')
SORTIE = os.path.join(RACINE, 'data', 'can-parties-installation.csv')

CHAPITRES = {
    '583': "Parties d'installation courant fort — bâtiments utilitaires",
    '584': "Parties d'installation courant faible — bâtiments utilitaires",
    '585': "Parties d'installation courant fort — bâtiments d'habitation",
    '586': "Parties d'installation courant faible — bâtiments d'habitation",
}

# <w:t> seul — surtout pas <w:tcPr>, d'où le groupe optionnel explicite.
BALISE_TEXTE = re.compile(r'<w:t(?: [^>]*)?>(.*?)</w:t>', re.S)
NUMERO = re.compile(r'^\d{3}[\s.]?\d{3}[\s.]?\d{3}$')


def texte(fragment):
    return html.unescape(''.join(BALISE_TEXTE.findall(fragment))).strip()


def lire_lignes(chemin):
    # Le fichier est sur OneDrive et souvent verrouillé : on travaille sur une copie.
    tmp = os.path.join(tempfile.gettempdir(), 'can-extraction.docx')
    shutil.copyfile(chemin, tmp)
    xml = zipfile.ZipFile(tmp).read('word/document.xml').decode('utf-8')
    lignes = []
    for tbl in re.findall(r'<w:tbl>.*?</w:tbl>', xml, re.S):
        for tr in re.findall(r'<w:tr[ >].*?</w:tr>', tbl, re.S):
            cellules = [texte(tc) for tc in re.findall(r'<w:tc>.*?</w:tc>', tr, re.S)]
            if any(cellules):
                lignes.append(cellules)
    return lignes


def main():
    lignes = lire_lignes(SOURCE)
    positions, ignorees = [], 0

    for ligne in lignes:
        numero = ligne[0]
        if not NUMERO.match(numero) or re.sub(r'\D', '', numero)[:3] not in CHAPITRES:
            continue
        designation = (ligne[2] if len(ligne) > 2 else '').strip()

        # Certaines cellules ne contiennent que la fin d'une plage (« 585 912 225) »)
        # sans libellé exploitable : inutilisables telles quelles, on les écarte.
        if not designation or NUMERO.match(designation.rstrip(')')):
            ignorees += 1
            continue

        # Le numéro peut arriver avec ou sans espaces : on repart des chiffres
        # seuls, sinon un découpage par position décale tout (583 31 001…).
        chiffres = re.sub(r'\D', '', numero)
        positions.append({
            'no_can': '%s %s %s' % (chiffres[0:3], chiffres[3:6], chiffres[6:9]),
            'chapitre': chiffres[:3],
            'designation': re.sub(r'\s+', ' ', designation),
        })

    positions.sort(key=lambda p: p['no_can'])
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with io.open(SORTIE, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['no_can', 'chapitre', 'designation'], delimiter=';')
        w.writeheader()
        w.writerows(positions)

    print('%d positions ecrites dans %s' % (len(positions), SORTIE))
    for ch, titre in sorted(CHAPITRES.items()):
        n = sum(1 for p in positions if p['chapitre'] == ch)
        print('   %s  %-58s %3d' % (ch, titre[:58], n))
    if ignorees:
        print('   %d lignes ecartees (renvois de plage sans libelle)' % ignorees)


if __name__ == '__main__':
    main()
