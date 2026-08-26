import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Sur GitHub Pages l'app vit dans un sous-dossier ; en local elle est à la
  // racine. Vite expose la valeur au code via import.meta.env.BASE_URL, dont
  // le routeur se sert comme préfixe — une seule source de vérité.
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      /*
       * selfDestroying : le service worker généré se désinscrit et vide ses
       * caches au lieu de servir l'app.
       *
       * Pourquoi : tant qu'on développe et que l'app tourne sur un serveur
       * local, le précache n'apporte rien — mais il sert obstinément l'ancienne
       * version, au point qu'une modification livrée n'arrivait jamais à
       * l'écran. À remettre à `false` le jour de l'hébergement, quand le vrai
       * hors ligne (téléphone, sous-sol) deviendra le sujet.
       */
      // Hors ligne uniquement pour la version en ligne (VITE_PWA=on).
      // En local le précache n'apporte rien et sert obstinément l'ancienne version.
      selfDestroying: process.env.VITE_PWA !== 'on',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Chantier — gestion électrique',
        short_name: 'Chantier',
        description: 'Affaires, métrés et matériel sur le chantier',
        lang: 'fr',
        start_url: process.env.VITE_BASE ?? '/',
        display: 'standalone',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // L'app doit démarrer sans réseau : tout le bundle est précaché.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: (process.env.VITE_BASE ?? '/') + 'index.html',
      },
    }),
  ],
})
