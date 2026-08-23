import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Metre, type Uuid } from '../db/schema'
import {
  ajouterLigneMetre, creerLocal, majCiLigne, majLigneMetre, metreCourant, validerMetre,
} from '../db/repo'
import { useSession } from '../lib/session'
import { Onglets } from '../App'
import { exporterPourOiken } from '../lib/export-oiken'
import { correspond, motsCles } from '../lib/recherche'

export default function MetreEcran() {
  const { id = '' } = useParams()
  const { profil, estChef } = useSession()
  const [metre, setMetre] = useState<Metre | null>(null)
  const [localActif, setLocalActif] = useState<Uuid | null>(null)
  const [recherche, setRecherche] = useState('')
  const [nouveauLocal, setNouveauLocal] = useState('')
  const [ligneLibre, setLigneLibre] = useState({ ouvert: false, libelle: '', no_can: '', unite: 'pce' })
  // Dans un même chantier, presque toutes les lignes partagent le même CI :
  // on le choisit une fois et les nouvelles lignes en héritent.
  const [ciParDefaut, setCiParDefaut] = useState('')

  useEffect(() => {
    if (profil) void metreCourant(id, profil.id).then(setMetre)
  }, [id, profil])

  useEffect(() => {
    setCiParDefaut(localStorage.getItem(`ci-defaut-${id}`) ?? '')
  }, [id])

  const affaire = useLiveQuery(() => db.affaires.get(id), [id])
  const locaux = useLiveQuery(
    async () => {
      const l = await db.locaux.where('affaire_id').equals(id).toArray()
      return l.filter((x) => !x.supprime_le).sort((a, b) => a.ordre - b.ordre)
    },
    [id],
    [],
  )
  const postes = useLiveQuery(async () => db.postes.toArray(), [], [])
  const codesCi = useLiveQuery(async () => db.codes_ci.toArray(), [], [])
  const articles = useLiveQuery(async () => db.articles.toArray(), [], [])
  const lignes = useLiveQuery(
    async () => {
      if (!metre) return []
      const l = await db.metre_lignes.where('metre_id').equals(metre.id).toArray()
      return l.filter((x) => !x.supprime_le)
    },
    [metre?.id],
    [],
  )

  const parCode = useMemo(() => new Map(postes.map((p) => [p.code, p])), [postes])
  const parRef = useMemo(() => new Map(articles.map((a) => [a.ref, a])), [articles])

  useEffect(() => {
    if (!localActif && locaux.length > 0) setLocalActif(locaux[0].id)
  }, [locaux, localActif])

  /**
   * Recherche unifiée : les 419 postes de métré ET les articles du catalogue.
   * Un métré se fait aussi avec le matériel posé — l'ouvrier ne doit pas avoir
   * à savoir si « prise T13 » est un poste ou un article pour la trouver.
   */
  const resultats = useMemo(() => {
    const mots = motsCles(recherche)
    if (mots.join('').length < 2) return []
    const dePostes = postes
      .filter((p) => correspond(p.libelle + ' ' + p.code + ' ' + (p.no_can ?? ''), mots))
      .map((p) => ({
        cle: 'poste:' + p.code, libelle: p.libelle, detail: p.no_can ?? p.code,
        unite: p.unite, source: 'poste' as const, ref: p.code, no_can: p.no_can ?? null,
      }))
    const dArticles = articles
      .filter((a) => correspond(a.libelle + ' ' + a.designation + ' ' + a.ref + ' ' + a.e_no + ' ' + (a.mots ?? ''), mots))
      .map((a) => ({
        cle: 'article:' + a.ref,
        libelle: a.libelle,
        detail: a.e_no ? 'ELDAS ' + a.e_no : a.ref,
        unite: a.unite, source: 'article' as const, ref: a.ref, no_can: null,
      }))
    return [...dePostes, ...dArticles].slice(0, 12)
  }, [recherche, postes, articles])

  const lignesEnrichies = useMemo(() => {
    const enrichies = lignes.map((l) => {
      const poste = l.poste_code ? parCode.get(l.poste_code) : undefined
      const article = l.article_ref ? parRef.get(l.article_ref) : undefined
      return {
        ...l,
        libelle: l.libelle_libre ?? poste?.libelle ?? article?.libelle ?? l.poste_code ?? '—',
        no_can_affiche: l.no_can ?? poste?.no_can ?? '',
        local: locaux.find((x) => x.id === l.local_id)?.nom ?? '—',
      }
    })
    // Le chef relit trié alphabétiquement (exigence du cahier des charges) ;
    // l'ouvrier voit ses dernières saisies en premier.
    return estChef
      ? enrichies.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
      : enrichies.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [lignes, parCode, parRef, locaux, estChef])

  const fige = metre ? metre.statut !== 'brouillon' : false

  async function ajouterResultat(r: {
    source: 'poste' | 'article'; ref: string; unite: string; no_can: string | null
  }) {
    if (!metre || !profil) return
    await ajouterLigneMetre(
      metre.id,
      {
        poste_code: r.source === 'poste' ? r.ref : undefined,
        article_ref: r.source === 'article' ? r.ref : undefined,
        unite: r.unite,
        no_can: r.no_can,
        ci: ciParDefaut || null,
      },
      1, localActif, profil.id,
    )
    setRecherche('')
  }

  async function ajouterLigneLibre() {
    if (!metre || !profil || !ligneLibre.libelle.trim()) return
    await ajouterLigneMetre(
      metre.id,
      {
        libelle_libre: ligneLibre.libelle.trim(),
        no_can: ligneLibre.no_can.trim() || null,
        unite: ligneLibre.unite,
        ci: ciParDefaut || null,
      },
      1, localActif, profil.id,
    )
    setLigneLibre({ ouvert: false, libelle: '', no_can: '', unite: 'pce' })
  }

  return (
    <>
      <Onglets id={id} actif="metre" />
      <div className="mx-auto max-w-2xl p-4">
        {/* --- locaux : le métré est découpé par local (décision du 21.08) --- */}
        <div className="mb-3 flex flex-wrap gap-2">
          {locaux.map((l) => (
            <button
              key={l.id}
              onClick={() => setLocalActif(l.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                localActif === l.id ? 'bg-ardoise-900 text-white' : 'bg-ardoise-100 text-ardoise-600'
              }`}
            >
              {l.niveau ? `${l.niveau} · ` : ''}
              {l.nom}
            </button>
          ))}
        </div>

        <form
          className="mb-5 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!nouveauLocal.trim()) return
            const nid = await creerLocal(id, nouveauLocal, null)
            setNouveauLocal('')
            setLocalActif(nid)
          }}
        >
          <input
            value={nouveauLocal}
            onChange={(e) => setNouveauLocal(e.target.value)}
            placeholder="Ajouter un local — ex. Cuisine"
            className="h-tap flex-1 rounded-xl border border-ardoise-200 px-4"
          />
          <button className="h-tap shrink-0 rounded-xl bg-ardoise-100 px-5 font-semibold">+</button>
        </form>

        {!fige && (
          <div className="mb-3 rounded-2xl border border-ardoise-200 bg-white p-3">
            <label className="text-xs font-semibold tracking-wide text-ardoise-400 uppercase">
              Code d'installation par défaut
            </label>
            <select
              value={ciParDefaut}
              onChange={(e) => {
                setCiParDefaut(e.target.value)
                localStorage.setItem(`ci-defaut-${id}`, e.target.value)
              }}
              className="h-tap mt-1 w-full rounded-xl border border-ardoise-200 px-3"
            >
              <option value="">— aucun, à choisir ligne par ligne —</option>
              {codesCi.map((c) => (
                <option key={c.code} value={c.code}>
                  CI {c.code} · {c.libelle}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ardoise-400">
              Appliqué aux nouvelles lignes. Chaque ligne reste modifiable ensuite.
            </p>
          </div>
        )}

        {fige ? (
          <p className="mb-4 rounded-2xl bg-chantier-500/20 p-4 text-center text-sm font-medium">
            Métré {metre?.statut === 'valide' ? 'validé' : 'transmis au bureau'} — figé.
          </p>
        ) : (
          <>
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher — poste, câble, canal, n° CAN…"
              className="h-tap mb-2 w-full rounded-xl border border-ardoise-200 px-4"
            />
            {resultats.length > 0 && (
              <ul className="mb-3 space-y-1">
                {resultats.map((p) => (
                  <li key={p.cle}>
                    <button
                      onClick={() => void ajouterResultat(p)}
                      className="w-full rounded-xl border border-ardoise-200 bg-white p-3 text-left active:bg-ardoise-100"
                    >
                      <span className="text-sm font-semibold">{p.libelle}</span>
                      <span className="ml-2 font-mono text-xs text-ardoise-400">
                        {p.detail} · {p.unite}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Matériel spécial que personne n'avait prévu au catalogue. */}
            {!ligneLibre.ouvert ? (
              <button
                onClick={() => setLigneLibre({ ...ligneLibre, ouvert: true })}
                className="mb-5 w-full rounded-xl border border-dashed border-ardoise-200 py-3 text-sm font-semibold text-ardoise-600"
              >
                + Ligne personnalisée (matériel spécial)
              </button>
            ) : (
              <div className="mb-5 space-y-2 rounded-2xl border border-ardoise-200 bg-white p-4">
                <input
                  autoFocus
                  value={ligneLibre.libelle}
                  onChange={(e) => setLigneLibre({ ...ligneLibre, libelle: e.target.value })}
                  placeholder="Désignation — ex. Coffret étanche sur mesure"
                  className="h-tap w-full rounded-xl border border-ardoise-200 px-4"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={ligneLibre.no_can}
                    onChange={(e) => setLigneLibre({ ...ligneLibre, no_can: e.target.value })}
                    placeholder="N° CAN (facultatif)"
                    className="h-tap w-full rounded-xl border border-ardoise-200 px-4"
                  />
                  <select
                    value={ligneLibre.unite}
                    onChange={(e) => setLigneLibre({ ...ligneLibre, unite: e.target.value })}
                    className="h-tap w-full rounded-xl border border-ardoise-200 px-4"
                  >
                    <option value="pce">pièces</option>
                    <option value="m">mètres</option>
                    <option value="h">heures</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLigneLibre({ ouvert: false, libelle: '', no_can: '', unite: 'pce' })}
                    className="h-tap flex-1 rounded-xl bg-ardoise-100 font-semibold"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => void ajouterLigneLibre()}
                    className="h-tap flex-1 rounded-xl bg-ardoise-900 font-semibold text-white"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <h2 className="mb-3 text-sm font-semibold tracking-wide text-ardoise-400 uppercase">
          {lignesEnrichies.length} ligne{lignesEnrichies.length > 1 ? 's' : ''}
          {estChef && lignesEnrichies.length > 1 && ' · tri alphabétique'}
        </h2>

        {lignesEnrichies.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ardoise-200 p-6 text-center text-sm text-ardoise-400">
            Métré vide. Choisis un local, puis cherche un poste.
          </p>
        ) : (
          <ul className="space-y-2">
            {lignesEnrichies.map((l) => (
              <li key={l.id} className="rounded-2xl border border-ardoise-200 bg-white p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.libelle}</p>
                    <p className="font-mono text-xs text-ardoise-400">
                      {l.local}
                      {l.no_can_affiche && ` · ${l.no_can_affiche}`}
                    </p>
                  </div>
                  {!fige && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => void majLigneMetre(l.id, l.quantite - 1)}
                        className="size-11 rounded-xl bg-ardoise-100 text-xl font-bold"
                        aria-label="Retirer"
                      >
                        −
                      </button>
                      <label className="relative w-20 shrink-0">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={l.quantite}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (!Number.isNaN(v)) void majLigneMetre(l.id, v)
                          }}
                          className="h-11 w-full rounded-xl bg-ardoise-100 pr-6 text-center text-lg font-bold tabular-nums"
                          aria-label="Quantité"
                        />
                        {l.unite !== 'pce' && (
                          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-ardoise-400">
                            {l.unite}
                          </span>
                        )}
                      </label>
                      <button
                        onClick={() => void majLigneMetre(l.id, l.quantite + 1)}
                        className="size-11 rounded-xl bg-ardoise-100 text-xl font-bold"
                        aria-label="Ajouter"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>

                {/* Colonne « CI » de la fiche OIKEN — un choix de métreur, ligne par ligne. */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs font-semibold text-ardoise-400">CI</span>
                  <select
                    value={l.ci ?? ''}
                    disabled={fige}
                    onChange={(e) => void majCiLigne(l.id, e.target.value || null)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${
                      l.ci ? 'border-ardoise-200' : 'border-dashed border-ardoise-200 text-ardoise-400'
                    }`}
                  >
                    <option value="">— à définir —</option>
                    {codesCi.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.libelle}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}

        {estChef && metre && lignesEnrichies.length > 0 && (
          <div className="mt-4 space-y-2">
            {!fige && (
              <button
                onClick={async () => {
                  if (!profil) return
                  await validerMetre(metre.id, profil.id)
                  setMetre({ ...metre, statut: 'valide' })
                }}
                className="h-tap w-full rounded-xl bg-ardoise-900 font-semibold text-white"
              >
                Valider le métré
              </button>
            )}
            <button
              onClick={() => exporterPourOiken(affaire, metre, lignesEnrichies, locaux, codesCi)}
              className="h-tap w-full rounded-xl border border-ardoise-900 font-semibold"
            >
              Exporter pour la fiche OIKEN
            </button>
            <p className="text-center text-xs text-ardoise-400">
              Enregistre un fichier .json — c'est lui que tu me donnes pour générer l'Excel.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
