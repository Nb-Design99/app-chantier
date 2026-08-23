import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TypeAffaire } from '../db/schema'
import { creerAffaire } from '../db/repo'
import { useSession } from '../lib/session'
import Planning from './Planning'

const TYPES: { cle: TypeAffaire; libelle: string }[] = [
  { cle: 'chantier', libelle: 'Chantier' },
  { cle: 'depannage', libelle: 'Dépannage' },
  { cle: 'remise_conformite', libelle: 'Remise en conformité' },
]

const LIBELLE_TYPE: Record<TypeAffaire, string> = {
  chantier: 'Chantier',
  depannage: 'Dépannage',
  remise_conformite: 'Remise en conformité',
}

export default function Affaires() {
  const navigate = useNavigate()
  const { profil, estChef } = useSession()
  const [ouvert, setOuvert] = useState(false)
  const [type, setType] = useState<TypeAffaire>('chantier')
  const [nom, setNom] = useState('')
  const [numeroAffaire, setNumeroAffaire] = useState('')
  const [localite, setLocalite] = useState('')

  const affaires = useLiveQuery(
    async () => {
      const tout = await db.affaires.toArray()
      return tout
        .filter((a) => !a.supprime_le)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    [],
    [],
  )

  const avancement = useLiveQuery(
    async () => {
      const etapes = await db.etapes.toArray()
      const parAffaire = new Map<string, { faites: number; total: number }>()
      for (const e of etapes) {
        if (e.supprime_le) continue
        const c = parAffaire.get(e.affaire_id) ?? { faites: 0, total: 0 }
        c.total += 1
        if (e.terminee) c.faites += 1
        parAffaire.set(e.affaire_id, c)
      }
      return parAffaire
    },
    [],
    new Map<string, { faites: number; total: number }>(),
  )

  async function valider(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !profil) return
    const id = await creerAffaire({ type, nom, numero_affaire: numeroAffaire, localite }, profil.id)
    setOuvert(false)
    setNom(''); setNumeroAffaire(''); setLocalite('')
    navigate(`/affaire/${id}`)
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Planning />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Affaires</h1>
        {estChef && (
          <button
            onClick={() => setOuvert((o) => !o)}
            className="h-tap rounded-xl bg-ardoise-900 px-5 font-semibold text-white active:bg-ardoise-800"
          >
            {ouvert ? 'Annuler' : '+ Nouvelle'}
          </button>
        )}
      </div>

      {ouvert && (
        <form onSubmit={valider} className="mb-5 space-y-3 rounded-2xl border border-ardoise-200 bg-white p-4">
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.cle}
                type="button"
                onClick={() => setType(t.cle)}
                className={`rounded-xl px-2 py-3 text-sm font-semibold ${
                  type === t.cle
                    ? 'bg-chantier-500 text-ardoise-900'
                    : 'bg-ardoise-100 text-ardoise-600'
                }`}
              >
                {t.libelle}
              </button>
            ))}
          </div>
          <input
            value={nom} onChange={(e) => setNom(e.target.value)} autoFocus
            placeholder="Nom de l'affaire — ex. Chalet Moulin"
            className="h-tap w-full rounded-xl border border-ardoise-200 px-4"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={numeroAffaire} onChange={(e) => setNumeroAffaire(e.target.value)}
              placeholder="N° d'affaire"
              className="h-tap w-full rounded-xl border border-ardoise-200 px-4"
            />
            <input
              value={localite} onChange={(e) => setLocalite(e.target.value)} placeholder="Localité"
              className="h-tap w-full rounded-xl border border-ardoise-200 px-4"
            />
          </div>
          <button className="h-tap w-full rounded-xl bg-ardoise-900 font-semibold text-white">
            Créer l'affaire
          </button>
          {type === 'chantier' && (
            <p className="text-center text-xs text-ardoise-400">
              Les 6 étapes seront créées automatiquement.
            </p>
          )}
        </form>
      )}

      {affaires.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ardoise-200 p-8 text-center text-ardoise-400">
          Aucune affaire pour l'instant.
        </p>
      ) : (
        <ul className="space-y-2">
          {affaires.map((a) => {
            const av = avancement.get(a.id)
            return (
              <li key={a.id}>
                <button
                  onClick={() => navigate(`/affaire/${a.id}`)}
                  className="w-full rounded-2xl border border-ardoise-200 bg-white p-4 text-left active:bg-ardoise-50"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{a.nom}</span>
                    <span className="shrink-0 text-xs font-medium text-ardoise-400">
                      {LIBELLE_TYPE[a.type]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-ardoise-600">
                    {[a.numero_affaire, a.localite].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {av && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ardoise-100">
                        <div
                          className="h-full rounded-full bg-chantier-500"
                          style={{ width: `${(av.faites / av.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium tabular-nums text-ardoise-400">
                        {av.faites}/{av.total}
                      </span>
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
