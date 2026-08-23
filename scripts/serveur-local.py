# -*- coding: utf-8 -*-
"""
Petit serveur local pour faire tourner l'app comme une vraie application.

Sert `app/dist` (la version compilée) sur http://localhost:5199.

Pourquoi pas simplement `python -m http.server` : l'app a des adresses internes
(/affaire/xxx). Un serveur de fichiers ordinaire répond 404 dessus dès qu'on
recharge la page. Ici, toute adresse inconnue renvoie index.html et c'est l'app
qui décide quoi afficher.

Lancé automatiquement par Chantier.vbs — pas besoin de l'appeler à la main.
"""
import os
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 5199
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(RACINE, 'app', 'dist')


class Handler(SimpleHTTPRequestHandler):
    # HTTP/1.0 (le défaut) ferme la connexion à chaque réponse ; Chrome refuse
    # d'installer un service worker servi comme ça.
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST, **kwargs)

    def send_head(self):
        chemin = self.translate_path(self.path)
        # Adresse interne de l'app (pas un fichier) → on rend index.html.
        if not os.path.exists(chemin) and '.' not in os.path.basename(chemin):
            self.path = '/index.html'
        return super().send_head()

    def end_headers(self):
        # Le service worker et index.html ne doivent jamais rester en cache,
        # sinon une mise à jour de l'app n'arrive jamais jusqu'à l'écran.
        if self.path in ('/', '/index.html', '/sw.js', '/registerSW.js'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def log_message(self, *args):
        pass  # silence : le serveur tourne en tâche de fond


def deja_lance():
    with socket.socket() as s:
        return s.connect_ex(('127.0.0.1', PORT)) == 0


def main():
    if not os.path.isdir(DIST):
        print("L'app n'est pas compilée. Lancer d'abord : npm run build")
        sys.exit(1)
    if deja_lance():
        print('Le serveur tourne déjà sur le port %d.' % PORT)
        return
    print('Chantier — http://localhost:%d  (fermer cette fenêtre arrête l\'app)' % PORT)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()
