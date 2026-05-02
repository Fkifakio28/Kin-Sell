# Audit erreurs, tutos, Git et VPS - 2026-05-01

## Résumé

Le problème principal des erreurs rouges vient du client web : `request()` créait presque toujours une `ApiError` avec le texte `API 400` ou `API 500`, même quand le backend renvoyait un message lisible. Les composants qui affichent `err.message` héritaient donc d'un message technique.

Deuxième problème : la page `ErrorBoundaryPage` affichait des détails debug bruts (`ErrorName: message`) à l'utilisateur. C'est utile en dev, mais trop technique en production.

Troisième problème : les tutos ne cassent pas le build, mais le fichier `tutorial-steps.ts` contenait un bloc en encodage mixte avec des caractères `�` dans les sections articles, produits et services.

## Corrections déjà faites

- `apps/web/src/lib/api-core.ts`
  - Ajout d'une construction centralisée de messages lisibles.
  - Utilise `error`, `message` ou `detail` du backend quand c'est humain.
  - Remplace les codes techniques (`API 500`, `INVALID_PLAN_CODES`, `call_not_found`) par un message compréhensible selon le statut HTTP.

- `apps/web/src/features/error/ErrorBoundaryPage.tsx`
  - Ne montre plus les détails techniques en production.
  - Ne logge l'erreur routeur dans la console qu'en développement.
  - Remplace `Erreur 404` par `Page introuvable` et les autres statuts par un message moins brutal.

- `apps/web/src/components/tutorial-steps.ts`
  - Réparation du bloc corrompu en UTF-8.
  - Correction des textes des tutos `userArticlesSteps`, `businessProductsSteps`, `businessServicesSteps`.

## Audit Git

- Branche locale : `main`
- Suivi : `origin/main`
- Dernier commit observé : `90caef0 feat(blog): allow up to 100 posts per page, fetch 50`
- État avant correction : seulement deux dossiers non suivis visibles, `apps/web/public/downloads/` et `downloads/`.
- Après build local, `apps/web/dist` peut changer si suivi par Git ou générer du bruit local selon `.gitignore`.

## Audit VPS public

Checks effectués depuis le poste local :

- `https://kin-sell.com` répond `200 OK`.
- `robots.txt` et `sitemap.xml` répondent.
- `https://api.kin-sell.com/health` a répondu `429 Too Many Requests` après peu de requêtes.
- `curl` Windows sans `-k` échoue sur la vérification de révocation certificat (`CRYPT_E_NO_REVOCATION_CHECK`). Avec `-k`, le site répond. À vérifier côté environnement Windows/réseau et chaîne OCSP/CRL du certificat.

Risque VPS important : `/health` passe après `scrapeGuard()` dans `apps/api/src/index.ts`. En prod, un endpoint santé devrait être exempté de protections anti-scraping et rate-limit applicatif, sinon monitoring, déploiement et clients peuvent voir des 429 au lieu d'un état réel.

## Audit technique des erreurs restantes

Zones à reprendre ensuite :

- Plusieurs composants affichent encore `err.message` directement. Le correctif central améliore déjà beaucoup, mais il faut harmoniser les écrans sensibles : panier, paiement, produit, So-Kin, notifications, boost, dashboard admin.
- `uploads.service.ts` a déjà une extraction lisible côté upload, mais elle n'utilise pas encore le helper central.
- Certaines routes API renvoient encore des codes techniques dans `error`, par exemple `callId_invalid`, `not_participant`, `CREATE_FAILED`, `INVALID_PLAN_CODES`. Le client les masque maintenant, mais le backend devrait aussi exposer un `code` séparé et un `message` humain.
- Des `alert()` existent encore dans l'UI. Ils devraient passer par un composant d'alerte/toast cohérent.
- Les erreurs Zod backend renvoient `details` avec messages techniques potentiels. À transformer en phrase utilisateur selon champ.

## Prompt Claude 1 - finitions erreurs UX

```text
Tu travailles sur Kin-Sell. Objectif : supprimer tous les messages techniques visibles par les utilisateurs.

Contexte :
- Le client API est dans apps/web/src/lib/api-core.ts.
- ApiError contient status, message, data.
- Le helper central remplace déjà API 400/500 et codes techniques par des messages lisibles.

Tâches :
1. Auditer tous les usages frontend de err.message, error.message, alert(e?.message), toast.error(msg), setError(e?.message).
2. Pour chaque écran utilisateur, afficher une phrase claire en français, adaptée au contexte métier.
3. Garder les détails techniques seulement en console dev ou dans /errors côté backend.
4. Ne jamais afficher : API 400, API 500, call_not_found, INVALID_*, stack traces, Prisma, Zod brut, fetch failed.
5. Ajouter si utile un helper frontend getFriendlyErrorMessage(error, fallback, context).
6. Mettre à jour les tests ou ajouter des tests simples pour ApiError 400/500/429/technical-code.
7. Vérifier npm run build -w apps/web.

Livrable attendu :
- Liste des fichiers modifiés.
- Exemples avant/après de messages visibles.
- Résultat du build.
```

## Prompt Claude 2 - backend erreurs propres

```text
Tu travailles sur l'API Kin-Sell Express.

Objectif : standardiser les réponses d'erreur API sans casser le frontend.

Format cible :
{
  "error": "Message humain en français",
  "code": "OPTIONAL_TECHNICAL_CODE",
  "details": []
}

Tâches :
1. Auditer tous les res.status(...).json({ error: ... }) et throw new HttpError(...).
2. Remplacer les codes techniques visibles dans error par un message humain.
3. Si un code machine est utile, le mettre dans code, pas dans error.
4. Garder la compatibilité avec l'ancien frontend qui lit data.error.
5. Corriger les messages sans accents ("deja utilise", "role") quand ils sont visibles.
6. Ajouter des tests dans apps/api/src/__tests__/errors.test.ts pour 400, 401, 403, 404, 409, 422, 429, 500.
7. Vérifier npm run build -w apps/api et npm run test -w apps/api si possible.

Attention :
- Ne pas exposer stack, SQL, Prisma, JWT, secrets, chemins serveur.
- Les logs serveur peuvent garder le détail technique via logger.error.
```

## Prompt Claude 3 - tutos complets

```text
Tu travailles sur apps/web/src/components/tutorial-steps.ts et TutorialOverlay.

Objectif : vérifier 100% des tutos Kin-Sell.

Tâches :
1. Scanner tutorial-steps.ts pour caractères corrompus : �, Ã, Â, â€, ðŸ.
2. Corriger l'orthographe, les accents, la ponctuation et les phrases trop techniques.
3. Vérifier que chaque selector existe réellement dans le code TSX/CSS correspondant.
4. Signaler les selectors absents avec page, step id, selector, fichier probable.
5. Ne pas casser les exports existants.
6. Vérifier npm run build -w apps/web.

Livrable :
- Table des tutos réparés.
- Table des selectors manquants ou fragiles.
- Patch minimal.
```

## Prompt Claude 4 - VPS / prod

```text
Tu audites la prod Kin-Sell VPS.

Objectif : éviter que les utilisateurs voient des 429/500 inutiles et rendre le monitoring fiable.

À vérifier :
1. /health doit répondre avant scrapeGuard et avant rate-limit applicatif.
2. Nginx doit transmettre correctement X-Real-IP / X-Forwarded-For avec Cloudflare.
3. Express trust proxy doit correspondre au chemin réel Cloudflare -> Nginx -> API.
4. Les limites Nginx /api, /api/auth, /api/uploads ne doivent pas bloquer l'usage normal mobile.
5. PM2 doit redémarrer proprement et les logs doivent être rotatés.
6. Tester :
   - curl -I https://kin-sell.com
   - curl https://api.kin-sell.com/health
   - curl https://kin-sell.com/robots.txt
   - curl https://kin-sell.com/sitemap.xml
   - pm2 status
   - pm2 logs kinsell-api --lines 80
   - sudo nginx -t

Livrable :
- Problèmes classés Critique / Moyen / Faible.
- Patch proposé pour apps/api/src/index.ts et deploy/nginx.vps.kin-sell.conf.
- Commandes exactes de déploiement.
```
