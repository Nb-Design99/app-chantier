import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Etape } from '../db/schema'
import { basculerEtape, noterEtape } from '../db/repo'
import { Onglets } from '../App'

function LigneEtape({ etape }: { etape: Etape }) {
  const [edition, setEdition] = useState(false)
  const [note, setNote] = useState(etape.note ?? '')

  return (
    <li className="rounded-2xl border border-ardoise-200 bg-white">
      <div className="flex items-stretch">
        <button
          onClick={() => void basculerEtape(etape)}
          className="flex flex-1 items-center gap-3 p-4 text-left active:bg-ardoise-50"
        >
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold ${
              etape.terminee
                ? 'border-chantier-500 bg-chantier-500 text-ardoise-900'
                : 'border-ardoise-200 text-transparent'
            }`}
          >
            ✓
          </span>
          <span className="flex-1">
            <span className={`font-semibold ${etape.terminee ? 'text-ardoise-400 line-through' : ''}`}>
              {etape.ordre}. {etape.libelle}
            </span>
            {etape.date_fin && (
              <span className="block text-xs text-ardoise-400">
                terminée le {etape.date_fin.split('-').reverse().join('.')}
              </span>
            )}
          </span>
        </button>
        <button
          onClick={() => setEdition((e) => !e)}
          className="px-4 text-xl text-ardoise-400 active:bg-ardoise-50"
          aria-label="Note sur l'étape"
        >
          {etape.note ? '📝' : '＋'}
        </button>
      </div>

      {/* Le cas réel : « radier terminé MAIS un tube n'est pas passé ». */}
      {etape.note && !edition && (
        <p className="mx-4 mb-4 rounded-xl bg-chantier-500/15 px-3 py-2 text-sm">
          {etape.note}
        </p>
      )}

      {edition && (
        <div className="border-t border-ardoise-200 p-4">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Ex. tube pour prise cuisine à reprendre — paroi non finie"
            className="w-full rounded-xl border border-ardoise-200 p-3"
          />
          <button
            onClick={async () => {
              await noterEtape(etape.id, note)
              setEdition(false)
            }}
            className="h-tap mt-2 w-full rounded-xl bg-ardoise-900 font-semibold text-white"
          >
            Enregistrer la note
          </button>
        </div>
      )}
    </li>
  )
}

export default function DetailAffaire() {
  const { id = '' } = useParams()
  const affaire = useLiveQuery(() => db.affaires.get(id), [id])
  const etapes = useLiveQuery(
    async () => {
      const e = await db.etapes.where('affaire_id').equals(id).toArray()
      return e.filter((x) => !x.supprime_le).sort((a, b) => a.ordre - b.ordre)
    },
    [id],
    [],
  )

  if (!affaire) return <p className="p-8 text-center text-ardoise-400">Affaire introuvable.</p>

  return (
    <>
      <Onglets id={id} actif="suivi" />
      <div className="mx-auto max-w-2xl p-4">
        <h1 className="text-xl font-bold">{affaire.nom}</h1>
        <p className="mb-5 text-sm text-ardoise-600">
          {[affaire.client, affaire.localite].filter(Boolean).join(' · ') || '—'}
        </p>

        {etapes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ardoise-200 p-8 text-center text-sm text-ardoise-400">
            Pas d'étapes — les checklists ne concernent que les chantiers.
          </p>
        ) : (
          <ul className="space-y-2">
            {etapes.map((e) => (
              <LigneEtape key={e.id} etape={e} />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
