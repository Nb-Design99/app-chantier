import Dexie, { type Table } from 'dexie'

/**
 * Base locale du téléphone. C'est ELLE la source de vérité pendant la saisie :
 * l'interface n'écrit jamais dans Supabase directement, elle écrit ici, et le
 * module de synchro (src/sync) rejoue les changements quand le réseau revient.
 *
 * ⚠️ Ce schéma est le miroir exact de supabase/migrations/0001_schema_v1.sql —
 * mêmes noms de tables, mêmes colonnes, mêmes uuid générés côté client.
 * Toute divergence ici se paiera au branchement de Supabase. Si tu modifies une
 * table, modifie les deux.
 */

export type Uuid = string

export type RoleProfil = 'chef' | 'ouvrier'
export type TypeAffaire = 'chantier' | 'depannage' | 'remise_conformite'
export type StatutAffaire = 'a_venir' | 'en_cours' | 'en_attente' | 'termine'
export type StatutMetre = 'brouillon' | 'valide' | 'transmis_bureau'

/** Colonnes présentes sur tout ce qui se synchronise. */
export interface Synchronisable {
  updated_at: string
  supprime_le?: string | null
}

export interface Profil extends Synchronisable {
  id: Uuid
  nom: string
  role: RoleProfil
  actif: boolean
}

export interface Affaire extends Synchronisable {
  id: Uuid
  type: TypeAffaire
  nom: string
  /** Numéro d'affaire de l'entreprise — remplace le champ « client » à la saisie. */
  numero_affaire?: string | null
  client?: string | null
  adresse?: string | null
  npa?: string | null
  localite?: string | null
  date_debut?: string | null
  statut: StatutAffaire
  notes?: string | null
  cree_par?: Uuid | null
  created_at: string
}

export interface Etape extends Synchronisable {
  id: Uuid
  affaire_id: Uuid
  ordre: number
  libelle: string
  terminee: boolean
  date_fin?: string | null
  note?: string | null
}

export interface Local extends Synchronisable {
  id: Uuid
  affaire_id: Uuid
  niveau?: string | null
  nom: string
  ordre: number
}

/**
 * Référentiel : article réel du catalogue.
 * La clé est `ref` (référence fabricant) et NON le numéro ELDAS, parce que les
 * fils, câbles et canaux n'en ont pas encore : leur `e_no` reste vide et l'app
 * les signale comme à compléter.
 */
export interface Article {
  ref: string
  e_no: string
  marque: string
  gamme?: string
  /** Nom court, celui de la grille Matériel — c'est par là que l'ouvrier cherche. */
  libelle: string
  designation: string
  unite: string
  couleur?: string
}

/** Référentiel : ce que l'ouvrier voit et clique. */
export interface Ensemble {
  libelle: string
  categorie: string
  unite: string
  /** Fils, câbles et canaux : pas de déclinaison de couleur, une seule variante. */
  sansCouleur: boolean
  favori: boolean
  ordre: number
  variantes: { couleur: string; ref: string }[]
}

/**
 * Référentiel : poste de métré. Trois provenances mélangées volontairement,
 * parce qu'ils se cherchent tous de la même façon sur le terrain :
 *  - les 183 postes maison repris de ~/metre-elec
 *  - fils, câbles, canaux et postes en heures (data/postes-complements.csv)
 *  - les 216 parties d'installation CAN, chapitres 583 à 586, qui portent un
 *    `no_can` : ce sont elles qui remplissent la colonne « N° USIE / CAN »
 *    de la fiche OIKEN.
 */
export interface Poste {
  code: string
  categorie: string
  libelle: string
  unite: string
  schema?: string | null
  notes?: string | null
  no_can?: string | null
  ordre: number
}

/** Référentiel : code d'installation (colonne « CI » de la fiche). */
export interface CodeCI {
  code: string
  groupe: string
  conditions: string
  libelle: string
  exemples: string
}

export interface Categorie {
  code: string
  libelle: string
  ordre: number
  couleur: string
}

export interface LocalType {
  famille: string
  nom: string
  ordre: number
}

/**
 * Journal append-only du matériel. On n'écrase JAMAIS une quantité :
 * on empile des mouvements et on somme. C'est ce qui fait que deux téléphones
 * hors ligne qui ajoutent 3 et 2 prises donnent bien 5, et pas 2.
 * Une correction se fait avec une quantité négative.
 */
export interface MaterielMouvement extends Synchronisable {
  id: Uuid
  affaire_id: Uuid
  article_ref: string
  quantite: number
  note?: string | null
  auteur_id: Uuid
  commande_id?: Uuid | null
  created_at: string
}

export interface Metre extends Synchronisable {
  id: Uuid
  affaire_id: Uuid
  libelle: string
  statut: StatutMetre
  cree_par?: Uuid | null
  valide_par?: Uuid | null
  valide_le?: string | null
  transmis_le?: string | null
  created_at: string
}

export interface MetreLigne extends Synchronisable {
  id: Uuid
  metre_id: Uuid
  /**
   * Une ligne a exactement une origine : un poste du référentiel, un article du
   * catalogue, ou un libellé libre saisi sur le chantier pour du matériel
   * spécial que personne n'avait prévu.
   */
  poste_code?: string | null
  article_ref?: string | null
  libelle_libre?: string | null
  local_id?: Uuid | null
  quantite: number
  unite: string
  /** Code d'installation, colonne « CI » de la fiche OIKEN. */
  ci?: string | null
  /** Numéro USIE / CAN, recopié du poste ou saisi à la main sur une ligne libre. */
  no_can?: string | null
  note?: string | null
  auteur_id?: Uuid | null
  created_at: string
}

/**
 * File d'attente de synchro. Chaque écriture locale y dépose une opération ;
 * le module de synchro les rejoue dans l'ordre à la reconnexion, puis les
 * supprime. L'id de l'opération sert de clé d'idempotence côté serveur.
 */
export interface OperationSync {
  id: Uuid
  table: string
  operation: 'insert' | 'update'
  payload: unknown
  created_at: string
  tentatives: number
  derniere_erreur?: string | null
}

export class BaseChantier extends Dexie {
  profils!: Table<Profil, Uuid>
  affaires!: Table<Affaire, Uuid>
  etapes!: Table<Etape, Uuid>
  locaux!: Table<Local, Uuid>
  metres!: Table<Metre, Uuid>
  metre_lignes!: Table<MetreLigne, Uuid>
  materiel_mouvements!: Table<MaterielMouvement, Uuid>

  articles!: Table<Article, string>
  ensembles!: Table<Ensemble, string>
  postes!: Table<Poste, string>
  codes_ci!: Table<CodeCI, string>
  categories!: Table<Categorie, string>
  locaux_types!: Table<LocalType, number>

  sync_file!: Table<OperationSync, Uuid>

  constructor() {
    super('app-chantier')
    // ─────────────────────────────────────────────────────────────────
    // Historique des versions. IndexedDB ne sait PAS changer la clé primaire
    // d'une table existante : il faut la supprimer dans une version, puis la
    // recréer dans la suivante. D'où v2 qui jette `articles` et v3 qui la
    // reconstruit sur `ref`. Ne jamais modifier une version déjà publiée —
    // toujours en ajouter une.
    // ─────────────────────────────────────────────────────────────────
    this.version(1).stores({
      profils: 'id, role',
      affaires: 'id, statut, type, updated_at',
      etapes: 'id, affaire_id, [affaire_id+ordre]',
      locaux: 'id, affaire_id, [affaire_id+ordre]',
      metres: 'id, affaire_id, statut',
      metre_lignes: 'id, metre_id, local_id, poste_code, article_e_no',
      materiel_mouvements: 'id, affaire_id, e_no, created_at',
      articles: 'e_no, couleur, designation',
      ensembles: 'libelle, categorie, favori, ordre',
      postes: 'code, categorie, ordre',
      categories: 'code, ordre',
      locaux_types: '++id, famille',
      sync_file: 'id, created_at',
    })

    // v2 : on jette `articles`, dont la clé passe du numéro ELDAS à `ref`
    // (les fils et câbles n'ont pas de numéro ELDAS). C'est un référentiel
    // entièrement rechargé depuis le bundle : rien à sauvegarder.
    this.version(2).stores({ articles: null })

    this.version(3).stores({
      metre_lignes: 'id, metre_id, local_id, poste_code, article_ref',
      materiel_mouvements: 'id, affaire_id, article_ref, created_at',
      articles: 'ref, e_no, couleur, designation',
      postes: 'code, categorie, no_can, ordre',
      codes_ci: 'code, groupe',
    })

    // v4 : index sur le libellé court, ajouté quand la recherche du métré a dû
    // retrouver un article avec les mots de l'écran Matériel.
    this.version(4).stores({
      articles: 'ref, e_no, couleur, libelle, designation',
    })
  }
}

export const db = new BaseChantier()

/** uuid v4 généré côté client : l'id ne change jamais, même créé hors ligne. */
export const uuid = (): Uuid => crypto.randomUUID()

export const maintenant = (): string => new Date().toISOString()
