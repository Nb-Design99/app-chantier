import {
  db, uuid, maintenant,
  type Affaire, type Etape, type Local, type Metre, type MetreLigne,
  type MaterielMouvement, type Tache, type TypeAffaire, type Uuid,
} from './schema'

/**
 * Toutes les écritures passent par ici, et toutes déposent une opération dans
 * `sync_file`. C'est le seul endroit à connaître ce contrat : quand on branchera
 * Supabase, seul src/sync/pousser.ts videra la file — aucun écran ne bouge.
 */
async function journaliser(table: string, operation: 'insert' | 'update', payload: unknown) {
  await db.sync_file.add({
    id: uuid(), table, operation, payload,
    created_at: maintenant(), tentatives: 0,
  })
}

export const ETAPES_CHANTIER = [
  'Radier', 'Dalle', 'Élévation', 'Tubage', 'Tirage de fil', "Pose d'appareillage",
]

// ---------------------------------------------------------------- Affaires

export async function creerAffaire(
  saisie: {
    type: TypeAffaire; nom: string; numero_affaire?: string
    adresse?: string; localite?: string; date_debut?: string
  },
  auteurId: Uuid,
): Promise<Uuid> {
  const id = uuid()
  const affaire: Affaire = {
    id,
    type: saisie.type,
    nom: saisie.nom.trim(),
    numero_affaire: saisie.numero_affaire?.trim() || null,
    adresse: saisie.adresse?.trim() || null,
    localite: saisie.localite?.trim() || null,
    date_debut: saisie.date_debut || null,
    statut: 'en_cours',
    cree_par: auteurId,
    created_at: maintenant(),
    updated_at: maintenant(),
  }

  await db.transaction('rw', db.affaires, db.etapes, db.sync_file, async () => {
    await db.affaires.add(affaire)
    await journaliser('affaires', 'insert', affaire)

    // Les 6 étapes ne concernent qu'un chantier — un dépannage n'en a pas.
    if (saisie.type === 'chantier') {
      const etapes: Etape[] = ETAPES_CHANTIER.map((libelle, i) => ({
        id: uuid(), affaire_id: id, ordre: i + 1, libelle,
        terminee: false, updated_at: maintenant(),
      }))
      await db.etapes.bulkAdd(etapes)
      for (const e of etapes) await journaliser('etapes', 'insert', e)
    }
  })

  return id
}

export async function majAffaire(id: Uuid, champs: Partial<Affaire>) {
  const patch = { ...champs, updated_at: maintenant() }
  await db.transaction('rw', db.affaires, db.sync_file, async () => {
    await db.affaires.update(id, patch)
    await journaliser('affaires', 'update', { id, ...patch })
  })
}

// ------------------------------------------------------------------ Étapes

export async function basculerEtape(etape: Etape) {
  const terminee = !etape.terminee
  const patch = {
    terminee,
    date_fin: terminee ? maintenant().slice(0, 10) : null,
    updated_at: maintenant(),
  }
  await db.transaction('rw', db.etapes, db.sync_file, async () => {
    await db.etapes.update(etape.id, patch)
    await journaliser('etapes', 'update', { id: etape.id, ...patch })
  })
}

/** Le cas d'usage réel : « radier terminé MAIS un tube n'est pas passé ». */
export async function noterEtape(etapeId: Uuid, note: string) {
  const patch = { note: note.trim() || null, updated_at: maintenant() }
  await db.transaction('rw', db.etapes, db.sync_file, async () => {
    await db.etapes.update(etapeId, patch)
    await journaliser('etapes', 'update', { id: etapeId, ...patch })
  })
}

// ------------------------------------------------------------------ Locaux

export async function creerLocal(affaireId: Uuid, nom: string, niveau: string | null) {
  const dernier = await db.locaux.where('affaire_id').equals(affaireId).count()
  const local: Local = {
    id: uuid(), affaire_id: affaireId, nom: nom.trim(), niveau,
    ordre: (dernier + 1) * 10, updated_at: maintenant(),
  }
  await db.transaction('rw', db.locaux, db.sync_file, async () => {
    await db.locaux.add(local)
    await journaliser('locaux', 'insert', local)
  })
  return local.id
}

// ---------------------------------------------------------------- Matériel

/**
 * Ajout de matériel. On empile un mouvement, on ne modifie jamais un total.
 * `quantite` négative = correction.
 */
export async function ajouterMateriel(
  affaireId: Uuid, ref: string, quantite: number, auteurId: Uuid, note?: string,
) {
  const mvt: MaterielMouvement = {
    id: uuid(), affaire_id: affaireId, article_ref: ref, quantite,
    note: note?.trim() || null, auteur_id: auteurId,
    created_at: maintenant(), updated_at: maintenant(),
  }
  await db.transaction('rw', db.materiel_mouvements, db.sync_file, async () => {
    await db.materiel_mouvements.add(mvt)
    await journaliser('materiel_mouvements', 'insert', mvt)
  })
  return mvt.id
}

export interface BesoinMateriel {
  article_ref: string
  quantite: number
  derniere_demande: string
}

/** L'équivalent local de la vue `materiel_besoins` : la somme du journal. */
export async function besoinsMateriel(affaireId: Uuid): Promise<BesoinMateriel[]> {
  const mvts = await db.materiel_mouvements.where('affaire_id').equals(affaireId).toArray()
  const cumul = new Map<string, BesoinMateriel>()
  for (const m of mvts) {
    if (m.supprime_le) continue
    const e = cumul.get(m.article_ref)
      ?? { article_ref: m.article_ref, quantite: 0, derniere_demande: m.created_at }
    e.quantite += m.quantite
    if (m.created_at > e.derniere_demande) e.derniere_demande = m.created_at
    cumul.set(m.article_ref, e)
  }
  return [...cumul.values()].filter((b) => b.quantite !== 0)
}

// ---------------------------------------------------------------- Planning

export const aujourdhui = (): string => new Date().toLocaleDateString('sv-SE')

export async function creerTache(
  affaireId: Uuid, libelle: string, jour: string, auteurId: Uuid, assigneA?: Uuid | null,
) {
  const t: Tache = {
    id: uuid(), affaire_id: affaireId, jour, libelle: libelle.trim(),
    faite: false, assigne_a: assigneA ?? null, cree_par: auteurId,
    created_at: maintenant(), updated_at: maintenant(),
  }
  await db.transaction('rw', db.taches, db.sync_file, async () => {
    await db.taches.add(t)
    await journaliser('taches', 'insert', t)
  })
  return t.id
}

export async function basculerTache(t: Tache) {
  const faite = !t.faite
  const patch = {
    faite,
    date_faite: faite ? maintenant() : null,
    updated_at: maintenant(),
  }
  await db.transaction('rw', db.taches, db.sync_file, async () => {
    await db.taches.update(t.id, patch)
    await journaliser('taches', 'update', { id: t.id, ...patch })
  })
}

export async function supprimerTache(id: Uuid) {
  const patch = { supprime_le: maintenant(), updated_at: maintenant() }
  await db.transaction('rw', db.taches, db.sync_file, async () => {
    await db.taches.update(id, patch)
    await journaliser('taches', 'update', { id, ...patch })
  })
}

// ------------------------------------------------------------------ Métrés

export async function metreCourant(affaireId: Uuid, auteurId: Uuid): Promise<Metre> {
  const existant = await db.metres
    .where('affaire_id').equals(affaireId)
    .filter((m) => m.statut === 'brouillon' && !m.supprime_le)
    .first()
  if (existant) return existant

  const metre: Metre = {
    id: uuid(), affaire_id: affaireId, libelle: 'Métré', statut: 'brouillon',
    cree_par: auteurId, created_at: maintenant(), updated_at: maintenant(),
  }
  await db.transaction('rw', db.metres, db.sync_file, async () => {
    await db.metres.add(metre)
    await journaliser('metres', 'insert', metre)
  })
  return metre
}

export interface CibleLigne {
  poste_code?: string
  article_ref?: string
  /** Matériel spécial que personne n'avait prévu : on le décrit à la main. */
  libelle_libre?: string
  unite?: string
  ci?: string | null
  no_can?: string | null
}

export async function ajouterLigneMetre(
  metreId: Uuid,
  cible: CibleLigne,
  quantite: number,
  localId: Uuid | null,
  auteurId: Uuid,
) {
  const ligne: MetreLigne = {
    id: uuid(), metre_id: metreId,
    poste_code: cible.poste_code ?? null,
    article_ref: cible.article_ref ?? null,
    libelle_libre: cible.libelle_libre ?? null,
    local_id: localId, quantite,
    unite: cible.unite ?? 'pce',
    ci: cible.ci ?? null,
    no_can: cible.no_can ?? null,
    auteur_id: auteurId,
    created_at: maintenant(), updated_at: maintenant(),
  }
  await db.transaction('rw', db.metre_lignes, db.sync_file, async () => {
    await db.metre_lignes.add(ligne)
    await journaliser('metre_lignes', 'insert', ligne)
  })
  return ligne.id
}

/** Le CI ne se devine pas : c'est un choix de métreur, ligne par ligne. */
export async function majCiLigne(id: Uuid, ci: string | null) {
  const patch = { ci, updated_at: maintenant() }
  await db.transaction('rw', db.metre_lignes, db.sync_file, async () => {
    await db.metre_lignes.update(id, patch)
    await journaliser('metre_lignes', 'update', { id, ...patch })
  })
}

export async function majLigneMetre(id: Uuid, quantite: number) {
  const patch = { quantite, updated_at: maintenant() }
  await db.transaction('rw', db.metre_lignes, db.sync_file, async () => {
    if (quantite <= 0) {
      await db.metre_lignes.update(id, { supprime_le: maintenant(), updated_at: maintenant() })
      await journaliser('metre_lignes', 'update', { id, supprime_le: maintenant() })
    } else {
      await db.metre_lignes.update(id, patch)
      await journaliser('metre_lignes', 'update', { id, ...patch })
    }
  })
}

/** Validation : réservée au chef, et le métré se fige ensuite. */
export async function validerMetre(metreId: Uuid, chefId: Uuid) {
  const patch = {
    statut: 'valide' as const, valide_par: chefId,
    valide_le: maintenant(), updated_at: maintenant(),
  }
  await db.transaction('rw', db.metres, db.sync_file, async () => {
    await db.metres.update(metreId, patch)
    await journaliser('metres', 'update', { id: metreId, ...patch })
  })
}
