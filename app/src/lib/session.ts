import { useEffect, useState } from 'react'
import { db, type Profil } from '../db/schema'

/**
 * Session locale, en attendant Supabase Auth.
 * Les écrans ne connaissent qu'un `profil` (id + role) : le jour du branchement,
 * seul ce fichier change — `useSession` renverra le profil issu du JWT Supabase
 * au lieu de celui choisi dans le sélecteur.
 */

const CLE = 'profil-actif'

export function useSession() {
  const [profil, setProfil] = useState<Profil | null>(null)
  const [profils, setProfils] = useState<Profil[]>([])
  const [pret, setPret] = useState(false)

  useEffect(() => {
    void (async () => {
      const tous = await db.profils.toArray()
      tous.sort((a, b) => (a.role === b.role ? a.nom.localeCompare(b.nom) : a.role === 'chef' ? -1 : 1))
      setProfils(tous)
      const memorise = localStorage.getItem(CLE)
      setProfil(tous.find((p) => p.id === memorise) ?? tous[0] ?? null)
      setPret(true)
    })()
  }, [])

  const choisir = (p: Profil) => {
    localStorage.setItem(CLE, p.id)
    setProfil(p)
  }

  return { profil, profils, choisir, pret, estChef: profil?.role === 'chef' }
}
