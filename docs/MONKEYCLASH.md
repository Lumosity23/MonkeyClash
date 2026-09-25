# MonkeyClash : état du projet

_Mis à jour le 25 septembre 2026._

MonkeyClash est un fork de [Monkeytype](https://github.com/monkeytypegame/monkeytype) avec un **mode duel en ligne entre potes**. On réutilise le client multijoueur « Tribe » de Monkeytype, qui est public, et on y ajoute **notre propre serveur temps réel**, puisque celui de Monkeytype n'est pas publié.

- **Site** : https://monkeyclash.assistantstudent.com (duels sur `/tribe`)
- **Repo** : https://github.com/Lumosity23/MonkeyClash, branche `monkeyclash`, construite sur la branche upstream `newtribemerge`
- **Serveur** : `192.168.129.93` (Debian 13, Docker), dossier `~/monkeyclash`

## Architecture

```
navigateur ── https ──► Cloudflare ── tunnel « monkeyclash » ──► web (nginx)
                                                                   ├── /            site Monkeytype buildé (Vite)
                                                                   ├── /api/        backend Monkeytype (Express) ──► MongoDB, Redis
                                                                   ├── /socket.io/  tribe-server (Socket.IO) ────► MongoDB
                                                                   └── /tribe-api/  tribe-server (API des stats)
Comptes : Firebase Authentication (projet monkeyclash-dbaab)
```

Tout est décrit dans `deploy/docker-compose.yml` : `web`, `tribe`, `backend`, `mongodb`, `redis` et `tunnel`.

## Ce qui marche

- **Duels** : salons privés ou publics avec un code à 6 caractères. Le chef choisit la config avec la barre de Monkeytype. Ensuite : compte à rebours, curseurs adverses en direct, résultats, positions, points, couronnes et chat (@mentions, emojis). Et « Next test » pour la revanche.
- **Serveur Tribe** (`tribe-server/`) : il implémente le protocole du client Tribe, reconstitué à partir de son code. Node 24 exécute directement le TypeScript. Tout est en mémoire, et un redémarrage ferme les salons. Il y a 29 tests (`pnpm test`).
- **Comptes** (Firebase) : inscription et connexion, résultats sauvegardés, records, profil public et XP.
- **Stats de duel** : le serveur vérifie le jeton Firebase à la connexion et prend le pseudo du compte. Chaque course à 2 joueurs ou plus est enregistrée (collections `tribeRaces`, `tribeUserStats` et `tribeHeadToHead`). Quitter une course en cours compte comme une défaite. Le menu Tribe affiche tes stats, tes face-à-face et le classement.
- **Lobby retravaillé** : code du salon en grand en haut à droite (un clic copie le lien d'invitation), barre de config Monkeytype (modifiable par le chef seulement), joueurs en cartes. Le zen est interdit en salon.
- **Branding** : thème `monkeyclash` par défaut (Serika Dark avec le rouge `#ca4754` en couleur principale et les erreurs en jaune), logo clavier « m c. », favicons et icônes redessinés. Plus de pubs ni de merch, et le footer pointe vers le fork.

## Pièges de la branche Tribe d'upstream (déjà corrigés)

La branche `newtribemerge` est en chantier. Si quelque chose casse, **soupçonne le code upstream autant que le nôtre**. Déjà corrigés :

1. Un contrôle AFK terminait **tous** les tests au bout de 3 s : son compteur de touches renvoyait 0 (`test-timer.ts`).
2. Les sélecteurs `tr#${userId}` plantaient quand l'id commençait par un chiffre.
3. Le `structuredClone` de la config Chart.js échouait à cause de ses callbacks.
4. Le bouton « Next test » de l'écran de résultats n'était pas branché : `qs` ne renvoie que le premier élément trouvé.
5. **`addResult` du backend était un bouchon** qui ne sauvegardait rien. Il a été restauré depuis le commit master `d88f5efa0`.
6. Dans la config auto-hébergée, **l'XP était désactivée** et les pubs activées.

## Exploitation

```sh
# redéployer après un push sur monkeyclash
ssh 192.168.129.93
cd ~/monkeyclash && git pull && cd deploy
docker compose up -d --build web tribe backend   # ne reconstruire que ce qui a changé
docker compose ps
docker compose logs -f tribe                     # ou backend, web, tunnel
docker compose restart backend                   # après un changement de backend-configuration.json
```

- **Config du backend** : `deploy/backend-configuration.json`, relue à chaque démarrage (inscription, profils, XP, tribe).
- **Variables** : `deploy/.env` sur le serveur, hors git. Le modèle est dans `deploy/.env.example` : `SITE_URL`, `LAN_PORT` (8090), `FINISH_TIMER_SECONDS` et les clés reCAPTCHA.
- **Secrets** (hors git, dans `deploy/secrets/` sur le serveur) : `serviceAccountKey.json` (clé Firebase Admin, **ne jamais la lire ni la publier**), `tunnel.yml` et `creds.json` (tunnel Cloudflare).
- **Accès sur le réseau local** : http://192.168.129.93:8090
- **Base de données** : `docker compose exec mongodb mongo monkeytype`

## Développement local

```sh
corepack pnpm install
corepack pnpm build-pkg                         # les paquets internes doivent être buildés
cd tribe-server && pnpm dev                      # :3005, stats en mémoire sans MONGO_URI
cd frontend && FORCE_TRIBE=true pnpm dev         # :3000, puis http://localhost:3000/tribe
```

- Turbo et le hook git `post-checkout` ont besoin de `pnpm` dans le PATH, sinon `git checkout` et `git restore` sortent en erreur.
- Le hook pre-commit lance oxlint en mode strict sur les fichiers indexés. Évite de modifier des fichiers upstream sans raison : certains, comme `vitest.config.ts`, échouent déjà au lint.
- `frontend/src/ts/constants/firebase-config.ts` est ignoré par git : c'est une copie locale de `deploy/firebase-config.ts`.

## Scripts

- `scripts/banner/make_banner.py` et `preview.py` : la bannière animée du README (les commandes sont dans la docstring).
- `scripts/branding/recolor_icons.py` puis `make_icons.py` : recolorent les icônes et dessinent le logo « m c. » dans toutes les icônes, à partir du logo de `Logo.tsx`.

## Limites connues

- Les résultats envoyés par le navigateur sont **crus sans vérification** : pas d'anti-triche, ni dans le serveur Tribe ni dans le backend (pas de module anticheat).
- **Aucune limite** de connexions par IP ni de débit par événement (seul le chat a un délai).
- **Pas d'email** : sans SMTP, la vérification d'email et « mot de passe oublié » ne marchent pas.
- **reCAPTCHA** tourne avec les clés de test de Google.
- La page « about » raconte encore Monkeytype.
- **Capacité mesurée** : le serveur Tribe tient environ 4000 à 5000 joueurs simultanés sur ce CPU. En pratique, c'est le débit montant de la box qui limite, avec environ 2 à 4 Ko/s par joueur en course.

## Prochaines étapes

1. **Anti-triche**, en commençant par ce que le serveur peut vérifier lui-même : cohérence du wpm, du temps et des caractères avec la course qu'il a chronométrée, cohérence avec la progression reçue pendant la course, et bornes plausibles.
2. **Limites anti-abus** : connexions par IP et débit maximum par événement socket.
3. **Public** : politique de confidentialité et suppression de compte (RGPD), SMTP, vraies clés reCAPTCHA.
4. **Matchmaking** : activer les amis Monkeytype (`connections`), n'afficher les face-à-face qu'entre amis, et ne garder que les 50 dernières courses contre des inconnus.
5. **Avant toute annonce** : contacter Miodec en privé, puis lancer une bêta avec les personnes intéressées (ticket upstream #255).
