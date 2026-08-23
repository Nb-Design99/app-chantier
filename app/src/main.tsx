import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { initialiserBase } from './db/seed'

// Les référentiels sont chargés avant le premier rendu : l'app doit être
// utilisable au tout premier lancement, y compris sans réseau.
void initialiserBase().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
})
