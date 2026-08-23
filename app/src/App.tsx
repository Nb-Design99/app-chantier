import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/schema'
import { useSession } from './lib/session'
import { statutSync } from './sync'
import { useEffect, useState } from 'react'
import Affaires from './ecrans/Affaires'
import DetailAffaire from './ecrans/DetailAffaire'
import Materiel from './ecrans/Materiel'
import MetreEcran from './ecrans/Metre'

function BandeauSync() {
  const enAttente = useLiveQuery(() => db.sync_file.count(), [], 0)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void statutSync().then((s) => setMessage(s.message ?? ''))
  }, [enAttente])

  if (!message) return null
  return (
    <div className="bg-chantier-500 px-4 py-1.5 text-center text-sm font-medium text-ardoise-900">
      {message}
      {enAttente > 0 && ` · ${enAttente} modification${enAttente > 1 ? 's' : ''} en attente`}
    </div>
  )
}

function SelecteurProfil() {
  const { profil, profils, choisir } = useSession()
  if (!profil) return null
  return (
    <select
      value={profil.id}
      onChange={(e) => {
        const p = profils.find((x) => x.id === e.target.value)
        if (p) {
          choisir(p)
          location.reload()
        }
      }}
      className="rounded-lg border border-ardoise-200 bg-white px-3 py-1.5 text-sm font-medium text-ardoise-800"
      aria-label="Utilisateur actif"
    >
      {profils.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nom} · {p.role}
        </option>
      ))}
    </select>
  )
}

export default function App() {
  const { pret } = useSession()
  const navigate = useNavigate()

  if (!pret) return <div className="p-8 text-center text-ardoise-400">Chargement…</div>

  return (
    <div className="flex h-full flex-col">
      <BandeauSync />

      <header className="flex items-center justify-between gap-3 border-b border-ardoise-200 bg-white px-4 py-3">
        <button
          onClick={() => navigate('/')}
          className="text-left text-lg font-bold tracking-tight text-ardoise-900"
        >
          Chantier
        </button>
        <SelecteurProfil />
      </header>

      <main className="flex-1 overflow-y-auto pb-4">
        <Routes>
          <Route path="/" element={<Affaires />} />
          <Route path="/affaire/:id" element={<DetailAffaire />} />
          <Route path="/affaire/:id/materiel" element={<Materiel />} />
          <Route path="/affaire/:id/metre" element={<MetreEcran />} />
        </Routes>
      </main>
    </div>
  )
}

export function Onglets({ id, actif }: { id: string; actif: 'suivi' | 'materiel' | 'metre' }) {
  const onglets = [
    { cle: 'suivi', libelle: 'Suivi', href: `/affaire/${id}` },
    { cle: 'materiel', libelle: 'Matériel', href: `/affaire/${id}/materiel` },
    { cle: 'metre', libelle: 'Métré', href: `/affaire/${id}/metre` },
  ] as const

  return (
    <nav className="sticky top-0 z-10 flex border-b border-ardoise-200 bg-white">
      {onglets.map((o) => (
        <NavLink
          key={o.cle}
          to={o.href}
          end
          className={`flex-1 py-3 text-center text-sm font-semibold ${
            actif === o.cle
              ? 'border-b-2 border-chantier-500 text-ardoise-900'
              : 'text-ardoise-400'
          }`}
        >
          {o.libelle}
        </NavLink>
      ))}
    </nav>
  )
}
