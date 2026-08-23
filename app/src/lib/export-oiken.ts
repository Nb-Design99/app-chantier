import type { Affaire, CodeCI, Local, Metre } from '../db/schema'

/**
 * Export du métré vers la fiche OIKEN.
 *
 * L'app produit un .json, pas un .xlsx — c'est délibéré. Le modèle
 * `data/sources/modele-fiche-oiken.xlsx` porte le logo OIKEN, ses styles, sa
 * zone d'impression et ses deux onglets de référence. Régénérer tout ça depuis
 * un navigateur donnerait un fichier qui ressemble à la fiche sans en être une.
 *
 * Le .json est repris par `scripts/metre-vers-oiken.py`, qui remplit une COPIE
 * du modèle : la mise en forme d'origine est conservée à l'identique.
 */

export interface LigneExport {
  libelle: string
  local: string
  quantite: number
  unite: string
  ci?: string | null
  no_can_affiche: string
  note?: string | null
}

export interface MetreExport {
  genere_le: string
  affaire: {
    nom: string
    numero_affaire: string | null
    localite: string | null
    type: string
  }
  metre: { libelle: string; statut: string }
  /** Un bloc par local, dans l'ordre du chantier — c'est la structure de la fiche. */
  locaux: {
    nom: string
    lignes: { objet: string; ci: string; no_can: string; quantite: number; unite: string }[]
  }[]
  codes_ci_utilises: { code: string; libelle: string }[]
}

export function construireExport(
  affaire: Affaire | undefined,
  metre: Metre,
  lignes: LigneExport[],
  locaux: Local[],
  codesCi: CodeCI[],
): MetreExport {
  const ordreLocal = new Map(locaux.map((l, i) => [l.nom, i]))
  const groupes = new Map<string, LigneExport[]>()
  for (const l of lignes) {
    const cle = l.local || '—'
    if (!groupes.has(cle)) groupes.set(cle, [])
    groupes.get(cle)!.push(l)
  }

  const utilises = new Set(lignes.map((l) => l.ci).filter(Boolean) as string[])

  return {
    genere_le: new Date().toISOString(),
    affaire: {
      nom: affaire?.nom ?? 'Sans nom',
      numero_affaire: affaire?.numero_affaire ?? null,
      localite: affaire?.localite ?? null,
      type: affaire?.type ?? 'chantier',
    },
    metre: { libelle: metre.libelle, statut: metre.statut },
    locaux: [...groupes.entries()]
      .sort((a, b) => (ordreLocal.get(a[0]) ?? 999) - (ordreLocal.get(b[0]) ?? 999))
      .map(([nom, l]) => ({
        nom,
        lignes: l
          .sort((x, y) => x.libelle.localeCompare(y.libelle, 'fr'))
          .map((x) => ({
            objet: x.libelle,
            ci: x.ci ?? '',
            no_can: x.no_can_affiche ?? '',
            quantite: x.quantite,
            unite: x.unite,
          })),
      })),
    codes_ci_utilises: codesCi
      .filter((c) => utilises.has(c.code))
      .map((c) => ({ code: c.code, libelle: c.libelle })),
  }
}

/** Nom de fichier sûr : on ne garde que ce qui passe sur tous les systèmes. */
export function nomFichier(nomAffaire: string): string {
  const propre = nomAffaire
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  return `metre-${propre || 'sans-nom'}.json`
}

export function exporterPourOiken(
  affaire: Affaire | undefined,
  metre: Metre,
  lignes: LigneExport[],
  locaux: Local[],
  codesCi: CodeCI[],
) {
  const donnees = construireExport(affaire, metre, lignes, locaux, codesCi)
  const blob = new Blob([JSON.stringify(donnees, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier(donnees.affaire.nom)
  a.click()
  URL.revokeObjectURL(url)
}
