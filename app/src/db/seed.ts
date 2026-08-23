import { db, uuid, maintenant, type Profil } from './schema'
import categories from '../data/categories.json'
import postes from '../data/postes.json'
import locauxTypes from '../data/locaux-types.json'
import ensembles from '../data/ensembles.json'
import articles from '../data/articles.json'
import codesCi from '../data/codes-ci.json'
import catalogue from '../data/catalogue.json'

/**
 * Chargement des référentiels dans la base locale.
 * Idempotent : `bulkPut` écrase par clé, donc relancer ne duplique rien.
 * Ces données viendront de Supabase le jour du branchement ; en attendant
 * elles sont livrées avec le bundle, ce qui a l'avantage de rendre l'app
 * utilisable au premier lancement même sans réseau.
 */
export async function chargerReferentiels() {
  await db.transaction(
    'rw',
    [db.categories, db.postes, db.locaux_types, db.ensembles, db.articles, db.codes_ci],
    async () => {
    // Les référentiels sont entièrement dérivés du bundle : on les remplace au
    // lieu de les fusionner, sinon un libellé renommé laisse un doublon fantôme
    // (la clé primaire des ensembles est le libellé).
      await db.ensembles.clear()
      // Idem pour les articles : sans ça, une référence retirée du catalogue
      // (les prises à shutter, par exemple) resterait indéfiniment cherchable.
      await db.articles.clear()
      await db.categories.bulkPut(categories as never)
      await db.postes.bulkPut(postes as never)
      await db.codes_ci.bulkPut(codesCi as never)
      await db.ensembles.bulkPut(ensembles as never)
      // Le catalogue complet d'abord, les 144 articles des favoris ensuite :
      // ces derniers portent un libellé court plus lisible, ils doivent gagner.
      await db.articles.bulkPut(
        (catalogue as {
          ref: string; e_no: string; designation: string; couleur: string; mots: string
        }[]).map((a) => ({
          ...a, marque: 'Feller', gamme: 'EDIZIOdue', libelle: a.designation, unite: 'pce',
        })) as never,
      )
      await db.articles.bulkPut(articles as never)
      if ((await db.locaux_types.count()) === 0) {
        await db.locaux_types.bulkAdd(locauxTypes as never)
      }
    },
  )
}

/**
 * Comptes de démonstration, en attendant Supabase Auth.
 * Ces trois profils seront remplacés par les vrais comptes ; le reste du code
 * ne connaît qu'un `profil.id` et un `profil.role`, donc rien à réécrire.
 */
export async function chargerProfilsDemo() {
  if ((await db.profils.count()) > 0) return
  const profils: Profil[] = [
    { id: uuid(), nom: 'Nathan', role: 'chef', actif: true, updated_at: maintenant() },
    { id: uuid(), nom: 'Ouvrier 1', role: 'ouvrier', actif: true, updated_at: maintenant() },
    { id: uuid(), nom: 'Ouvrier 2', role: 'ouvrier', actif: true, updated_at: maintenant() },
  ]
  await db.profils.bulkAdd(profils)
}

export async function initialiserBase() {
  await chargerReferentiels()
  await chargerProfilsDemo()
}
