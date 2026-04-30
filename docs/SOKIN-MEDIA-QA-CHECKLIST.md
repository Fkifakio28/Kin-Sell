# So-Kin Media QA Checklist

Date: 12 avril 2026

## 1) Ratio media (1 media)
- Publier une image 9:16.
- Vérifier que la carte prend un rendu vertical (portrait) sans zoom.
- Publier une image 16:9.
- Vérifier que la carte s'adapte en horizontal (landscape) sans crop.
- Publier une video 9:16.
- Vérifier adaptation portrait + lecture son possible.
- Publier une video 16:9.
- Vérifier adaptation landscape + lecture son possible.

## 2) Regles de combinaison media
- Publier video seule: OK.
- Publier audio MP3 seul: OK.
- Publier image + audio MP3: OK.
- Publier texte seul: OK.
- Publier image seule: OK.
- Publier video + audio MP3: REFUSE (message erreur attendu).

## 3) Titre audio en description
- Publier un MP3 avec texte vide.
- Vérifier que le texte du post est auto-rempli avec le titre du fichier audio (sans lien cliquable).
- Vérifier que le titre n'ajoute pas de @mention ni #hashtag cliquable.

## 4) Viewer et previews
- Ouvrir un post audio: controle audio visible.
- Ouvrir un post image/video: viewer fonctionne.
- Verifier les vignettes d'apercu dans le studio:
  - image: miniature image
  - video: miniature video
  - audio: pastille audio

## 5) Android/iOS shell
- Android: ouvrir APK debug, vérifier la timeline So-Kin.
- iOS: ouvrir le projet Xcode (Mac), lancer sur simulateur/appareil et vérifier la timeline So-Kin.

## 6) Non-regression rapide
- Scroll du feed OK.
- Like/comment/repost OK.
- Publication standard sans media OK.
- Publication avec 5 medias max OK.
- Limite 2 videos max OK.
