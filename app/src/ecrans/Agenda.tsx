import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Affaire, type TypeAffaire } from '../db/schema'
import { creerAffaire } from '../db/repo'
import { useSession } from '../lib/session'
import { ajouterAAgenda, dateCourte, delaiRelatif, heure, memeJour } from '../lib/agenda'

/**
 * Agenda des dépannages : on inscrit un rendez-vous en quatre champs, il
 * apparaît dans la liste, et un bouton l'envoie dans l'agenda du téléphone
 * avec un rappel une heure avant.
 *
 * Sur le rappel : c'est l'agenda du téléphone qui notifie, pas l'app. Une
 * notification envoyée par l'app supposerait un serveur qui la pousse à l'heure
 * dite — impossible tant que rien n'est hébergé, et de toute façon moins fiable
 * que l'agenda natif, qui sonne hors ligne et téléphone verrouillé.
 */
export default function Agenda() {
  const navigate = useNavigate()
  const { profil, estChef } = useSession()
  const [ouvert, setOuvert] = useState(false)
  const [nom, setNom] = useState('')
  const [adresse, setAdresse] = useState('')
  const [quand, setQuand] = useState('')
  const [duree, setDuree] = useState(60)
  const [notes, setNotes] = useState('')
  const [type, setType] = useState<TypeAffaire>('depannage')
  const [tic, setTic] = useState(Date.now())

  // Les « dans 45 min » se rafraîchissent tout seuls.
  useEffect(() => {
    const t = setInterval(() => setTic(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const rendezVous = useLiveQuery(
    async () =>
      (await db.affaires.toArray())
        .filter((a) => !a.supprime_le && a.rendez_vous && a.statut !== 'termine')
        .sort((a, b) => (a.rendez_vous ?? '').localeCompare(b.rendez_vous ?? '')),
    [],
    [],
  )

  const maintenant = new Date(tic)
  const aVenir = rendezVous.filter(
    (a) => new Date(a.rendez_vous!).getTime() > tic - 3 * 3600_000,
  )
  const prochain = aVenir[0]

  async function valider(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !quand || !profil) return
    const id = await creerAffaire(
      {
        type,
        nom,
        adresse,
        notes,
        rendez_vous: new Date(quand).toISOString(),
        duree_min: duree,
      },
      profil.id,
    )
    setOuvert(false)
    setNom(''); setAdresse(''); setQuand(''); setNotes(''); setDuree(60)
    navigate(`/affaire/${id}`)
  }

  const Carte = ({ a }: { a: Affaire }) => {
    const iso = a.rendez_vous!
    const imminent = new Date(iso).getTime() - tic < 3600_000 && new Date(iso).getTime() > tic
    const passe = new Date(iso).getTime() < tic
    return (
      <li
        className={`rounded-2xl border bg-white ${
          imminent ? 'border-chantier-500 bg-chantier-500/10' : 'border-ardoise-200'
        }`}
      >
        <button
          onClick={() => navigate(`/affaire/${a.id}`)}
          className="w-full p-3 text-left active:bg-ardoise-50"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{a.nom}</span>
            <span className="shrink-0 text-sm font-bold tabular-nums">{heure(iso)}</span>
          </div>
          <div className="mt-0.5 text-xs text-ardoise-400">
            {memeJour(iso, maintenant) ? "aujourd'hui" : dateCourte(iso)}
            {' · '}
            <span className={imminent ? 'font-semibold text-chantier-600' : ''}>
              {delaiRelatif(iso, tic)}
            </span>
            {passe && ' · en cours ou passé'}
            {a.adresse && ` · ${a.adresse}`}
          </div>
        </button>
        <button
          onClick={() => ajouterAAgenda(a)}
          className="w-full border-t border-ardoise-200 py-2 text-xs font-semibold text-ardoise-600 active:bg-ardoise-50"
        >
          📅 Ajouter à mon agenda — rappel 1 h avant
        </button>
      </li>
    )
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-ardoise-400 uppercase">
          Rendez-vous
          {aVenir.length > 0 && ` · ${aVenir.length}`}
        </h2>
        {estChef && (
          <button
            onClick={() => setOuvert((o) => !o)}
            className="rounded-lg bg-chantier-500 px-3 py-1.5 text-sm font-semibold text-ardoise-900"
          >
            {ouvert ? 'Annuler' : '+ Dépannage'}
          </button>
        )}
      </div>

      {ouvert && (
        <form
          onSubmit={valider}
          className="mb-3 space-y-2 rounded-2xl border border-ardoise-200 bg-white p-3"
        >
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            autoFocus
            placeholder="Client ou objet — ex. Mme Rey, disjoncteur qui saute"
            className="h-tap w-full rounded-xl border border-ardoise-200 px-4"
          />
          <input
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder="Adresse"
            className="h-tap w-full rounded-xl border border-ardoise-200 px-4"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              value={quand}
              onChange={(e) => setQuand(e.target.value)}
              className="h-tap w-full rounded-xl border border-ardoise-200 px-3"
            />
            <select
              value={duree}
              onChange={(e) => setDuree(Number(e.target.value))}
              className="h-tap w-full rounded-xl border border-ardoise-200 px-3"
            >
              <option value={30}>30 min</option>
              <option value={60}>1 h</option>
              <option value={120}>2 h</option>
              <option value={240}>demi-journée</option>
              <option value={480}>journée</option>
            </select>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Ce qu'il y a à faire"
            className="w-full rounded-xl border border-ardoise-200 p-3"
          />
          <div className="flex gap-2">
            {(['depannage', 'remise_conformite'] as TypeAffaire[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold ${
                  type === t ? 'bg-ardoise-900 text-white' : 'bg-ardoise-100 text-ardoise-600'
                }`}
              >
                {t === 'depannage' ? 'Dépannage' : 'Remise en conformité'}
              </button>
            ))}
          </div>
          <button className="h-tap w-full rounded-xl bg-ardoise-900 font-semibold text-white">
            Inscrire le rendez-vous
          </button>
        </form>
      )}

      {aVenir.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ardoise-200 p-4 text-center text-sm text-ardoise-400">
          Aucun rendez-vous prévu.
        </p>
      ) : (
        <>
          {prochain && (
            <p className="mb-2 text-xs text-ardoise-400">
              Prochain : <span className="font-semibold">{prochain.nom}</span>{' '}
              {delaiRelatif(prochain.rendez_vous!, tic)}
            </p>
          )}
          <ul className="space-y-2">
            {aVenir.slice(0, 8).map((a) => (
              <Carte key={a.id} a={a} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
