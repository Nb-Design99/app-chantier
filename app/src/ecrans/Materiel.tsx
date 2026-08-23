import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { ajouterMateriel, besoinsMateriel } from '../db/repo'
import { useSession } from '../lib/session'
import { correspond, motsCles } from '../lib/recherche'
import { Onglets } from '../App'

/**
 * Écran matériel : une barre de recherche sur tout l'assortiment, et la liste
 * de ce qui a été demandé. Rien d'autre.
 *
 * Les grilles de favoris ont été retirées le 23.08 : avec 10 350 références
 * cherchables, une liste figée de 20 tuiles masquait le reste et imposait de
 * choisir une couleur avant même de savoir ce qu'on cherchait.
 */
const PAS_METRE = 10

export default function Materiel() {
  const { id = '' } = useParams()
  const { profil, estChef } = useSession()
  const [recherche, setRecherche] = useState('')

  const articles = useLiveQuery(async () => db.articles.toArray(), [], [])
  const mouvements = useLiveQuery(
    () => db.materiel_mouvements.where('affaire_id').equals(id).toArray(),
    [id],
    [],
  )
  const parRef = useMemo(() => new Map(articles.map((a) => [a.ref, a])), [articles])
  const besoins = useLiveQuery(() => besoinsMateriel(id), [id, mouvements.length], [])

  const resultats = useMemo(() => {
    const mots = motsCles(recherche)
    if (mots.join('').length < 2) return []
    return articles
      .filter((a) => correspond(a.designation + ' ' + a.libelle + ' ' + a.ref + ' ' + a.e_no + ' ' + (a.mots ?? ''), mots))
      .slice(0, 30)
  }, [recherche, articles])

  async function ajouter(ref: string, unite: string) {
    if (!profil) return
    await ajouterMateriel(id, ref, unite === 'm' ? PAS_METRE : 1, profil.id)
    if (navigator.vibrate) navigator.vibrate(15)
    setRecherche('')
  }

  return (
    <>
      <Onglets id={id} actif="materiel" />

      <div className="mx-auto max-w-2xl p-4">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher — 3xT13 blanc, sch 3, cable 3x1.5, thermostat…"
          className="h-tap mb-3 w-full rounded-xl border border-ardoise-200 px-4"
        />

        {recherche.trim().length >= 2 && (
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-ardoise-400 uppercase">
              {resultats.length === 30
                ? '30+ résultats'
                : resultats.length + ' résultat' + (resultats.length > 1 ? 's' : '')}
            </h2>
            {resultats.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-ardoise-200 p-4 text-center text-sm text-ardoise-400">
                Rien trouvé. Essaie moins de mots, ou la référence.
              </p>
            ) : (
              <ul className="space-y-1">
                {resultats.map((a) => (
                  <li key={a.ref}>
                    <button
                      onClick={() => void ajouter(a.ref, a.unite)}
                      className="w-full rounded-xl border border-ardoise-200 bg-white p-3 text-left active:bg-ardoise-100"
                    >
                      <span className="block text-sm font-semibold">{a.designation}</span>
                      <span className="font-mono text-xs text-ardoise-400">
                        {a.e_no ? 'ELDAS ' + a.e_no : 'sans n° ELDAS'} · {a.ref}
                        {a.unite === 'm' && ' · +' + PAS_METRE + ' m'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <h2 className="mb-3 text-sm font-semibold tracking-wide text-ardoise-400 uppercase">
          À commander
          {besoins.length > 0 && ' · ' + besoins.length + ' article' + (besoins.length > 1 ? 's' : '')}
        </h2>

        {besoins.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ardoise-200 p-6 text-center text-sm text-ardoise-400">
            Rien demandé pour l'instant. Cherche un article ci-dessus.
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
                          <>ELDAS {art.e_no} · {b.article_ref}</>
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
                      {/* Saisie directe : personne ne tape 12 fois pour 120 m. */}
                      <label className="relative w-20 shrink-0">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={b.quantite}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (profil && !Number.isNaN(v)) {
                              void ajouterMateriel(id, b.article_ref, v - b.quantite, profil.id)
                            }
                          }}
                          className="h-11 w-full rounded-xl bg-ardoise-100 pr-6 text-center text-lg font-bold tabular-nums"
                          aria-label="Quantité"
                        />
                        {art?.unite === 'm' && (
                          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-ardoise-400">
                            m
                          </span>
                        )}
                      </label>
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
        a?.e_no ?? '',
        a?.designation ?? '',
        a?.couleur ?? '',
        b.article_ref,
        b.quantite,
        a?.unite ?? 'pce',
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
