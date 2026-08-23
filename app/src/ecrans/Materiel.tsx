import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Ensemble } from '../db/schema'
import { ajouterMateriel, besoinsMateriel } from '../db/repo'
import { useSession } from '../lib/session'
import { Onglets } from '../App'

/**
 * L'écran le plus contraint du cahier des charges : « saisie en moins de
 * 3 clics, l'ouvrier a les mains sales et 30 secondes ».
 *
 * Le pari : la couleur ne change quasiment jamais dans une même affaire. On la
 * choisit une fois (elle est mémorisée par affaire), et ajouter un article
 * devient UN SEUL tap sur la grille de favoris.
 *
 * Les fils, câbles et canaux n'ont pas de couleur et se comptent au mètre : ils
 * sont dans une section à part, et un tap ajoute PAS_METRE mètres d'un coup —
 * personne ne tape 40 fois pour 40 mètres.
 */
const PAS_METRE = 10

export default function Materiel() {
  const { id = '' } = useParams()
  const { profil, estChef } = useSession()
  const [couleur, setCouleur] = useState<string>('blanc')
  const [dernier, setDernier] = useState<string | null>(null)

  const cleCouleur = `couleur-affaire-${id}`
  useEffect(() => {
    setCouleur(localStorage.getItem(cleCouleur) ?? 'blanc')
  }, [cleCouleur])

  const ensembles = useLiveQuery(
    async () => (await db.ensembles.toArray()).sort((a, b) => a.ordre - b.ordre),
    [],
    [],
  )
  const articles = useLiveQuery(async () => db.articles.toArray(), [], [])
  const mouvements = useLiveQuery(
    () => db.materiel_mouvements.where('affaire_id').equals(id).toArray(),
    [id],
    [],
  )

  const parRef = useMemo(() => new Map(articles.map((a) => [a.ref, a])), [articles])
  const besoins = useLiveQuery(() => besoinsMateriel(id), [id, mouvements.length], [])

  const couleurs = useMemo(() => {
    const set = new Set<string>()
    ensembles.forEach((e) => !e.sansCouleur && e.variantes.forEach((v) => set.add(v.couleur)))
    return [...set]
  }, [ensembles])

  function refDe(e: Ensemble): string | undefined {
    if (e.sansCouleur) return e.variantes[0]?.ref
    return e.variantes.find((v) => v.couleur === couleur)?.ref
  }

  async function ajouter(e: Ensemble, signe = 1) {
    const ref = refDe(e)
    if (!ref || !profil) return
    await ajouterMateriel(id, ref, signe * (e.unite === 'm' ? PAS_METRE : 1), profil.id)
    setDernier(e.libelle)
    if (navigator.vibrate) navigator.vibrate(15)
    setTimeout(() => setDernier(null), 700)
  }

  const appareils = ensembles.filter((e) => !e.sansCouleur && refDe(e))
  const auMetre = ensembles.filter((e) => e.sansCouleur)
  const categoriesMetre = [...new Set(auMetre.map((e) => e.categorie))]

  const Grille = ({ liste }: { liste: Ensemble[] }) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {liste.map((e) => (
        <button
          key={e.libelle}
          onClick={() => void ajouter(e)}
          className={`min-h-[5.5rem] rounded-2xl border p-3 text-left transition-colors ${
            dernier === e.libelle
              ? 'border-chantier-500 bg-chantier-500/25'
              : 'border-ardoise-200 bg-white active:bg-ardoise-100'
          }`}
        >
          <span className="block text-sm leading-snug font-semibold">{e.libelle}</span>
          <span className="mt-1 block text-xs text-ardoise-400">
            {e.unite === 'm' ? `+${PAS_METRE} m` : e.categorie}
          </span>
        </button>
      ))}
    </div>
  )

  return (
    <>
      <Onglets id={id} actif="materiel" />

      {/* La couleur se choisit une fois pour l'affaire — d'où le « 1 tap » ensuite. */}
      <div className="sticky top-[49px] z-10 border-b border-ardoise-200 bg-white px-4 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {couleurs.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCouleur(c)
                localStorage.setItem(cleCouleur, c)
              }}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                couleur === c ? 'bg-ardoise-900 text-white' : 'bg-ardoise-100 text-ardoise-600'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-ardoise-400 uppercase">
          Appareils {couleur} — 1 tap = +1
        </h2>
        <Grille liste={appareils} />

        {categoriesMetre.map((cat) => (
          <div key={cat}>
            <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-ardoise-400 uppercase">
              {cat} — 1 tap = +{PAS_METRE} m
            </h2>
            <Grille liste={auMetre.filter((e) => e.categorie === cat)} />
          </div>
        ))}

        <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-ardoise-400 uppercase">
          À commander {besoins.length > 0 && `· ${besoins.length} article${besoins.length > 1 ? 's' : ''}`}
        </h2>

        {besoins.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ardoise-200 p-6 text-center text-sm text-ardoise-400">
            Rien demandé pour l'instant.
          </p>
        ) : (
          <ul className="space-y-2">
            {besoins
              .slice()
              .sort((a, b) => b.derniere_demande.localeCompare(a.derniere_demande))
              .map((b) => {
                const art = parRef.get(b.article_ref)
                const pas = art?.unite === 'm' ? PAS_METRE : 1
                return (
                  <li
                    key={b.article_ref}
                    className="flex items-center gap-3 rounded-2xl border border-ardoise-200 bg-white p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {art?.designation ?? b.article_ref}
                      </p>
                      {/* Le numéro ELDAS : c'est LA donnée que Nathan vient chercher. */}
                      <p className="font-mono text-xs text-ardoise-400">
                        {art?.e_no ? (
                          <>
                            ELDAS {art.e_no} · {b.article_ref}
                          </>
                        ) : (
                          <span className="text-chantier-600">
                            N° ELDAS à compléter · {b.article_ref}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() =>
                          profil && void ajouterMateriel(id, b.article_ref, -pas, profil.id)
                        }
                        className="size-11 rounded-xl bg-ardoise-100 text-xl font-bold active:bg-ardoise-200"
                        aria-label="Retirer"
                      >
                        −
                      </button>
                      <span className="w-14 text-center text-lg font-bold tabular-nums">
                        {b.quantite}
                        {art?.unite === 'm' && <span className="text-xs font-normal"> m</span>}
                      </span>
                      <button
                        onClick={() =>
                          profil && void ajouterMateriel(id, b.article_ref, pas, profil.id)
                        }
                        className="size-11 rounded-xl bg-ardoise-100 text-xl font-bold active:bg-ardoise-200"
                        aria-label="Ajouter"
                      >
                        +
                      </button>
                    </div>
                  </li>
                )
              })}
          </ul>
        )}

        {estChef && besoins.length > 0 && (
          <button
            onClick={() => exporterCsv(besoins, parRef)}
            className="h-tap mt-4 w-full rounded-xl bg-ardoise-900 font-semibold text-white"
          >
            Exporter la liste (CSV)
          </button>
        )}
      </div>
    </>
  )
}

function exporterCsv(
  besoins: { article_ref: string; quantite: number }[],
  parRef: Map<string, { designation: string; e_no: string; couleur?: string; unite: string }>,
) {
  const lignes = [
    'no_eldas;designation;couleur;reference;quantite;unite',
    ...besoins.map((b) => {
      const a = parRef.get(b.article_ref)
      return [
        a?.e_no ?? '', a?.designation ?? '', a?.couleur ?? '',
        b.article_ref, b.quantite, a?.unite ?? 'pce',
      ].join(';')
    }),
  ]
  const blob = new Blob(['﻿' + lignes.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'materiel.csv'
  a.click()
  URL.revokeObjectURL(url)
}
