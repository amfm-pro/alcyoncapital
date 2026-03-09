# Mini application web statique + Supabase

Cette application est une TODO liste statique (HTML/CSS/JS) transformee en PWA, synchronisee via Supabase entre plusieurs appareils (PC et Galaxy S7).

## Fichiers principaux

- `index.html` : routeur (redirige selon la session vers `login.html` ou `app.html`).
- `login.html` : page de connexion (email + mot de passe).
- `app.html` : interface de liste (ajout, recherche, checkbox, suppression, deconnexion).
- `style.css` : style responsive.
- `assets/bg.jpg` : image de fond.
- `assets/icon.png` : source unique des icones PWA/favicon.
- `assets/icon-192.png`, `assets/icon-512.png` : icones PWA standard.
- `assets/icon-192-maskable.png`, `assets/icon-512-maskable.png` : icones maskable Android.
- `supabase.js` : init/config Supabase + session/auth + helpers REST communs.
- `router.js` : logique de redirection de `index.html`.
- `auth.js` : logique de connexion de `login.html`.
- `list.js` : CRUD items + UI de `app.html`.
- `manifest.webmanifest` : configuration PWA.
- `sw.js` : service worker avec pre-cache et cache-first.
- `config.example.js` : modele de configuration Supabase.
- `config.js` : configuration locale reelle (non committee).
- `scripts/build_icons.py` : generation locale des icones depuis `assets/icon.png`.

## Prerequis Supabase

Table attendue:

- `public.items(id uuid, user_id uuid, text text, done boolean, created_at timestamptz)`

RLS/policies attendues:

- lecture/ecriture limitees a `user_id = auth.uid()`.

## Configuration

1. Copier `config.example.js` vers `config.js`.
2. Remplir `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `config.js`.
3. Ne jamais utiliser la `service_role key` dans le front (interdit).

Exemple:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://your-project-id.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-key",
};
```

## Generation des icones

```powershell
python -m pip install Pillow
python scripts/build_icons.py
```

Le script genere automatiquement:

- `assets/icon-192.png`
- `assets/icon-512.png`
- `assets/icon-192-maskable.png`
- `assets/icon-512-maskable.png`

Si `assets/icon.png` est trop petit (moins de `512x512`), le script s'arrete avec une erreur explicite.

## Test local

Serveur Python:

```powershell
cd "c:\Users\am\OneDrive\Documents\01_projets\2026_02_13_Projet codex 1"
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

Flux attendu:

- `index.html` redirige vers `login.html` si deconnecte.
- connexion valide -> redirection vers `app.html`.
- refresh sur `app.html` conserve l'acces tant que la session est valide.
- acces direct a `app.html` sans session -> redirection vers `login.html`.
- bouton `Se deconnecter` -> `login.html`.

Checks CRUD:

- ajout d'item,
- toggle fait/a faire,
- suppression,
- synchro en ouvrant le meme compte sur un autre appareil.

## Redeploiement GitHub Pages (HTTPS)

```powershell
git add .
git commit -m "Split login/app pages + router"
git push
```

Ensuite attendre le redeploiement Pages, puis ouvrir:

- `https://<USER>.github.io/<REPO>/`

## Test Galaxy S7

1. Ouvrir l'URL HTTPS GitHub Pages dans Chrome Android.
2. Se connecter avec le meme compte que sur PC.
3. Ajouter/supprimer/toggle des items et verifier la synchro croisee.
4. Installer la PWA via menu Chrome (`Installer` ou `Ajouter a l'ecran d'accueil`).
5. Relancer l'app installee et verifier l'UI hors-ligne (les operations Supabase restent en ligne).

## Notes

- `config.js` est ignore par Git via `.gitignore`.
- Si tu modifies `sw.js`, incremente `CACHE_VERSION` pour forcer le refresh du cache.
- Pour forcer la mise a jour sur mobile:
1. Fermer totalement la PWA (et les onglets du site).
2. Relancer une fois l'URL pour laisser le nouveau service worker (`CACHE_VERSION`) s'activer.
3. Si l'icone ou le fond ne changent pas: Chrome Android > Parametres > Parametres des sites > Stockage > ton domaine > Effacer et reinitialiser.
4. Si l'icone installable reste ancienne: desinstaller la PWA puis la reinstaller.
