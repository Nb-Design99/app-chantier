import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { initialiserBase } from './db/seed'
import { db } from './db/schema'

const racine = createRoot(document.getElementById('root')!)

function afficherApp() {
  racine.render(
    <StrictMode>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

/**
 * Écran de dernier recours. Une page blanche sans message est le pire des
 * échecs : sur un chantier, personne ne peut ouvrir une console pour savoir
 * pourquoi l'app ne démarre pas.
 */
function afficherPanne(erreur: unknown) {
  const message = erreur instanceof Error ? erreur.message : String(erreur)
  racine.render(
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-bold">L'application n'a pas pu démarrer</h1>
      <p className="mt-2 text-sm text-ardoise-600">
        La base locale de ce téléphone est inutilisable. La réinitialiser recharge
        le catalogue et les postes depuis l'application ; les affaires et métrés
        qui n'ont pas encore été synchronisés seront perdus.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-ardoise-100 p-3 text-xs">{message}</pre>
      <button
        onClick={() => {
          db.close()
          indexedDB.deleteDatabase('app-chantier').onsuccess = () => location.reload()
        }}
        className="mt-4 h-tap w-full rounded-xl bg-ardoise-900 font-semibold text-white"
      >
        Réinitialiser la base locale
      </button>
    </div>,
  )
}

// Les référentiels sont chargés avant le premier rendu : l'app doit être
// utilisable au tout premier lancement, y compris sans réseau.
void initialiserBase().then(afficherApp).catch(afficherPanne)
