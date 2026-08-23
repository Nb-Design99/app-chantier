import { db } from '../db/schema'

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  LE POINT DE BRANCHEMENT SUPABASE — c'est le SEUL fichier à compléter.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le reste de l'app ne connaît pas Supabase : les écrans lisent et écrivent
 * dans la base locale (Dexie), et `src/db/repo.ts` dépose une opération dans
 * `sync_file` à chaque écriture. Ce module est le seul à devoir parler au
 * serveur. Tant qu'il est en mode « local », l'app est pleinement utilisable —
 * elle accumule simplement sa file d'attente.
 *
 * Ce qu'il restera à écrire ici quand le projet Supabase existera :
 *   1. pousser()  — rejouer sync_file dans l'ordre, en `upsert`, puis vider.
 *                   L'id de chaque opération sert de clé d'idempotence : rejouer
 *                   deux fois la même opération doit être sans effet.
 *   2. tirer()    — `select ... where updated_at > dernierSync` sur chaque
 *                   table, puis `bulkPut` en local. Les lignes avec
 *                   `supprime_le` non nul sont retirées de l'affichage : c'est
 *                   pour ça qu'on ne fait jamais de vrai DELETE.
 *   3. Résolution de conflit : dernier écrivain gagne sur les lignes de métré
 *                   (un seul ouvrier par affaire en pratique). Le matériel n'a
 *                   pas ce problème — c'est un journal, tout s'additionne.
 */

export type EtatSync = 'local' | 'synchronise' | 'en_cours' | 'erreur'

export interface StatutSync {
  etat: EtatSync
  enAttente: number
  dernierSync: string | null
  message?: string
}

const CONFIGURE = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export async function statutSync(): Promise<StatutSync> {
  const enAttente = await db.sync_file.count()
  if (!CONFIGURE) {
    return {
      etat: 'local',
      enAttente,
      dernierSync: null,
      message: 'Mode local — Supabase pas encore branché',
    }
  }
  return {
    etat: enAttente > 0 ? 'en_cours' : 'synchronise',
    enAttente,
    dernierSync: localStorage.getItem('dernier-sync'),
  }
}

export async function synchroniser(): Promise<StatutSync> {
  if (!CONFIGURE) return statutSync()
  // À implémenter au branchement — voir l'en-tête de ce fichier.
  throw new Error('Synchronisation pas encore implémentée')
}

export const supabaseConfigure = CONFIGURE
