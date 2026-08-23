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

/** Référentiel : article réel du catalogue, porteur du numéro ELDAS. */
export interface Article {
  e_no: string
  ref_fabricant?: string
  marque: string
  gamme?: string
  designation: string
  nature: string
  montage?: string
  couleur?: string
  dimension?: string
}

/** Référentiel : ce que l'ouvrier voit et clique. */
export interface Ensemble {
  libelle: string
  categorie: string
  montage: string
  favori: boolean
  ordre: number
  variantes: { couleur: string; code_couleur: string; e_no: string }[]
}

/** Référentiel : poste de métré CAN (184 postes, repris de ~/metre-elec). */
export interface Poste {
  code: string
  categorie: string
  libelle: string
  unite: string
  schema?: string | null
  notes?: string | null
  ordre: number
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
  e_no: string
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
  /** Une ligne pointe soit sur un poste CAN, soit sur un article — jamais les deux. */
  poste_code?: string | null
  article_e_no?: string | null
  local_id?: Uuid | null
  quantite: number
  ci?: string | null
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
  categories!: Table<Categorie, string>
  locaux_types!: Table<LocalType, number>

  sync_file!: Table<OperationSync, Uuid>

  constructor() {
    super('app-chantier')
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
  }
}

export const db = new BaseChantier()

/** uuid v4 généré côté client : l'id ne change jamais, même créé hors ligne. */
export const uuid = (): Uuid => crypto.randomUUID()

export const maintenant = (): string => new Date().toISOString()
