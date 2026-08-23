import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Tache } from '../db/schema'
import { aujourdhui, basculerTache, creerTache, supprimerTache } from '../db/repo'
import { useSession } from '../lib/session'

/**
 * Le planning du jour, en tête de la page d'accueil.
 *
 * « Report automatique au lendemain » : rien n'est déplacé en base. Une tâche
 * non faite dont le jour est passé remonte simplement dans la journée en cours,
 * signalée « en retard ». C'est un choix d'affichage, pas un traitement de
 * nuit — donc rien à faire tourner, et aucun risque qu'un téléphone resté trois
 * jours hors ligne rejoue trois reports d'un coup à la reconnexion.
 */
export default function Planning() {
  const { profil, estChef } = useSession()
  const [ouvert, setOuvert] = useState(false)
  const [libelle, setLibelle] = useState('')
  const [affaireId, setAffaireId] = useState('')
  const [jour, setJour] = useState(aujourdhui())

  const jourCourant = aujourdhui()

  const affaires = useLiveQuery(
    async () =>
      (await db.affaires.toArray())
        .filter((a) => !a.supprime_le && a.statut !== 'termine')
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [],
    [],
  )

  const taches = useLiveQuery(
    async () => {
      const tout = await db.taches.toArray()
      return tout.filter((t) => !t.supprime_le)
    },
    [],
    [],
  )

  const nomAffaire = (id: string) => affaires.find((a) => a.id === id)?.nom ?? '—'

  // À faire aujourd'hui = les tâches du jour + tout ce qui traîne depuis avant.
  const duJour = taches
    .filter((t) => !t.faite && t.jour <= jourCourant)
    .sort((a, b) => a.jour.localeCompare(b.jour))
  const aVenir = taches
    .filter((t) => !t.faite && t.jour > jourCourant)
    .sort((a, b) => a.jour.localeCompare(b.jour))
  const faitesAujourdhui = taches.filter(
    (t) => t.faite && (t.date_faite ?? '').slice(0, 10) === jourCourant,
  )

  async function valider(e: React.FormEvent) {
    e.preventDefault()
    if (!libelle.trim() || !affaireId || !profil) return
    await creerTache(affaireId, libelle, jour, profil.id)
    setLibelle('')
    setOuvert(false)
  }

  const Ligne = ({ t }: { t: Tache }) => {
    const enRetard = !t.faite && t.jour < jourCourant
    return (
      <li className="flex items-stretch rounded-2xl border border-ardoise-200 bg-white">
        <button
          onClick={() => void basculerTache(t)}
          className="flex flex-1 items-center gap-3 p-3 text-left active:bg-ardoise-50"
        >
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold ${
              t.faite
                ? 'border-chantier-500 bg-chantier-500 text-ardoise-900'
                : 'border-ardoise-200 text-transparent'
            }`}
          >
            ✓
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-sm font-semibold ${t.faite ? 'text-ardoise-400 line-through' : ''}`}>
              {t.libelle}
            </span>
            <span className="block text-xs text-ardoise-400">
              {nomAffaire(t.affaire_id)}
              {enRetard && (
                <span className="ml-2 font-semibold text-chantier-600">
                  en retard depuis le {t.jour.slice(8, 10)}.{t.jour.slice(5, 7)}
                </span>
              )}
            </span>
          </span>
        </button>
        {estChef && (
          <button
            onClick={() => void supprimerTache(t.id)}
            className="px-4 text-ardoise-400 active:bg-ardoise-50"
            aria-label="Supprimer la tâche"
          >
            ✕
          </button>
        )}
      </li>
    )
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-ardoise-400 uppercase">
          À faire aujourd'hui
          {duJour.length > 0 && ` · ${duJour.length}`}
        </h2>
        {estChef && affaires.length > 0 && (
          <button
            onClick={() => setOuvert((o) => !o)}
            className="rounded-lg bg-ardoise-100 px-3 py-1.5 text-sm font-semibold"
          >
            {ouvert ? 'Annuler' : '+ Tâche'}
          </button>
        )}
      </div>

      {ouvert && (
        <form onSubmit={valider} className="mb-3 space-y-2 rounded-2xl border border-ardoise-200 bg-white p-3">
          <input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            autoFocus
            placeholder="Quoi faire — ex. Tirer les fils du 1er"
            className="h-tap w-full rounded-xl border border-ardoise-200 px-4"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={affaireId}
              onChange={(e) => setAffaireId(e.target.value)}
              className="h-tap w-full rounded-xl border border-ardoise-200 px-3"
            >
              <option value="">— affaire —</option>
              {affaires.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={jour}
              onChange={(e) => setJour(e.target.value)}
              className="h-tap w-full rounded-xl border border-ardoise-200 px-3"
            />
          </div>
          <button className="h-tap w-full rounded-xl bg-ardoise-900 font-semibold text-white">
            Ajouter
          </button>
        </form>
      )}

      {duJour.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ardoise-200 p-4 text-center text-sm text-ardoise-400">
          {faitesAujourdhui.length > 0 ? 'Tout est fait pour aujourd’hui.' : 'Rien de prévu aujourd’hui.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {duJour.map((t) => (
            <Ligne key={t.id} t={t} />
          ))}
        </ul>
      )}

      {faitesAujourdhui.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer py-2 text-xs font-semibold text-ardoise-400">
            {faitesAujourdhui.length} faite{faitesAujourdhui.length > 1 ? 's' : ''} aujourd'hui
          </summary>
          <ul className="mt-2 space-y-2">
            {faitesAujourdhui.map((t) => (
              <Ligne key={t.id} t={t} />
            ))}
          </ul>
        </details>
      )}

      {aVenir.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer py-2 text-xs font-semibold text-ardoise-400">
            {aVenir.length} à venir
          </summary>
          <ul className="mt-2 space-y-2">
            {aVenir.map((t) => (
              <Ligne key={t.id} t={t} />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
