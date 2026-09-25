# MonkeyClash : état du projet

_Mis à jour le 25 septembre 2026._

MonkeyClash est un fork de [Monkeytype](https://github.com/monkeytypegame/monkeytype) avec un **mode duel en ligne entre potes**. On réutilise le client multijoueur « Tribe » de Monkeytype, qui est public, et on y ajoute **notre propre serveur temps réel**, puisque celui de Monkeytype n'est pas publié.

- **Site** : https://monkeyclash.assistantstudent.com (duels sur `/tribe`)
- **Repo** : https://github.com/Lumosity23/MonkeyClash, branche `monkeyclash`, construite sur la branche upstream `newtribemerge`
- **Hébergement** : un serveur Docker (`deploy/`) exposé par un tunnel Cloudflare

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
- **Serveur Tribe** (`tribe-server/`) : il implémente le protocole du client Tribe, reconstitué à partir de son code. Node 24 exécute directement le TypeScript. Tout est en mémoire, et un redémarrage ferme les salons. Tests : `pnpm test`.
- **Comptes** (Firebase) : inscription et connexion, résultats sauvegardés, records, profil public et XP.
- **Stats de duel** : le serveur vérifie le jeton Firebase à la connexion et prend le pseudo du compte. Chaque course à 2 joueurs ou plus est enregistrée (collections `tribeRaces`, `tribeUserStats` et `tribeHeadToHead`). Quitter une course en cours compte comme une défaite. Un compte n'a qu'une connexion à la fois : un nouvel onglet déconnecte l'ancien, sinon on pourrait remplir un salon avec son propre compte pour gonfler ses victoires. Le menu Tribe affiche tes stats, tes face-à-face et le classement.
- **Anti-triche** : le serveur Tribe ne croit pas le résultat envoyé par le client. Il le compare à ce qu'il a vu pendant la course, et aux frappes du joueur. Les frappes servent seulement à ce contrôle : elles ne sont ni stockées ni envoyées aux autres joueurs. Un résultat rejeté devient `invalid(raison)` : pas de position, pas de points, pas de stats. La raison est gardée dans la course (`flag`) et dans les logs (`[anticheat]`). Comme chez Monkeytype, les vraies règles sont dans un **module privé**, hors du repo (`tribe-server/src/private/anticheat.ts`, qui exporte `checkResult`). Sans lui, le serveur ne fait que les contrôles de base de `tribe-server/src/anticheat.ts`. Tu peux écrire tes propres règles avec la même interface. Un résultat accepté reçoit `verified` (✓ à côté du nom dans les résultats). Chaque compte a un compteur `flaggedRaces`, affiché dans ses stats (« rejected ») et dans le classement (✓ si tout est propre, ⚠ et le nombre sinon).
- **Limites anti-abus** (`tribe-server/src/limits.ts`) : 20 connexions simultanées et 60 nouvelles par minute par IP. Chaque socket a un débit d'événements (rafale de 40, puis 15/s ; créer ou rejoindre un salon coûte plus), et au-delà c'est « Slow down » puis la déconnexion. Les messages sont limités à 500 Ko, et l'API des stats à 120 requêtes par minute par IP. Derrière nginx (`TRUST_PROXY=true`), l'IP vient de `X-Real-IP`, que nginx remplit avec `CF-Connecting-IP` de Cloudflare. Le backend reçoit la même IP dans `X-Forwarded-For` : avant, il voyait tout le monde avec l'IP du conteneur cloudflared.
- **Intro** : au premier chargement, « clash » tombe sur « monkeytype » et fait tomber « type » (`loading.html`, `loading.scss`). La page de chargement attend la fin de l'animation.
- **Lobby retravaillé** : code du salon en grand en haut à droite (un clic copie le lien d'invitation), barre de config Monkeytype (modifiable par le chef seulement), joueurs en cartes. Le zen est interdit en salon.
- **Accueil** : la première page du site est `/tribe`. Le logo y mène aussi, et le solo reste sur l'icône clavier (`/`).
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
# redéployer après un push sur monkeyclash, depuis le checkout du serveur
git pull && cd deploy
docker compose up -d --build web tribe backend   # ne reconstruire que ce qui a changé
docker compose ps
docker compose logs -f tribe                     # ou backend, web, tunnel
docker compose restart backend                   # après un changement de backend-configuration.json
```

- **Config du backend** : `deploy/backend-configuration.json`, relue à chaque démarrage (inscription, profils, XP, tribe).
- **Variables** : `deploy/.env` sur le serveur, hors git. Le modèle est dans `deploy/.env.example` : `SITE_URL`, `LAN_PORT` (8090), `FINISH_TIMER_SECONDS` et les clés reCAPTCHA.
- **Secrets** (hors git, dans `deploy/secrets/` sur le serveur) : `serviceAccountKey.json` (clé Firebase Admin, à ne jamais publier), `tunnel.yml` et `creds.json` (tunnel Cloudflare).
- **Accès sur le réseau local** : `http://<ip du serveur>:8090`
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

- **Anti-triche** : il couvre les duels seulement. Les résultats solo du backend ne sont pas vérifiés (pas de module anticheat).
- **Pas d'email** : sans SMTP, la vérification d'email et « mot de passe oublié » ne marchent pas.
- **reCAPTCHA** tourne avec les clés de test de Google.
- La page « about » raconte encore Monkeytype.
- **Capacité** : compter environ 2 à 4 Ko/s montants par joueur en course, c'est souvent la connexion qui limite avant le CPU.

## Prochaines étapes

1. **Anti-triche, suite** : vérifier aussi les résultats solo du backend.
2. **Public** : politique de confidentialité et suppression de compte (RGPD), SMTP, vraies clés reCAPTCHA.
3. **Matchmaking** : activer les amis Monkeytype (`connections`), n'afficher les face-à-face qu'entre amis, et ne garder que les 50 dernières courses contre des inconnus.
4. **Bêta ouverte** avec les personnes intéressées.
