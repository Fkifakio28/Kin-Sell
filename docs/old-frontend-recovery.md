# Ancien Frontend Kin-Sel - Archive de Recuperation

## Sources de reference
- Ancien frontend public observe sur Vercel: https://frontend-omega-eight-15.vercel.app/
- Depot associe a analyser/reutiliser: https://github.com/Fkifakio28/Kin-sel.git
- Workspace de travail actuel: D:/Kin-Sell

## Objectif de cette archive
Conserver tout ce qui a ete etabli sur l'ancien frontend Kin-Sel avant redemarrage machine et avant recreation d'un nouveau dossier Kin-Sell.

Le point central a reproduire en priorite est le frontend, en particulier:
- la disposition exacte
- le theme sombre
- le style glassmorphism
- les proportions des cartes
- la hierarchie visuelle
- la densite de l'interface

## Etat reel constate
Le frontend actuel dans D:/Kin-Sell/apps/web ne correspond pas au rendu Vercel observe.

Le rendu Vercel ressemble a un dashboard marketplace dense, alors que le frontend local actuel est une page explorer plus marketing/editoriale.

Conclusion:
- le code local actuel ne doit pas etre pris comme reference visuelle principale
- la reference visuelle principale est le rendu Vercel capture par l'utilisateur

## Page confirmee visuellement
Pour l'instant, une seule page a ete confirmee visuellement avec capture: la home/dashboard.

## Composition visuelle de la home observee
### Structure globale
- Fond tres sombre bleu nuit, presque noir
- Grande zone centrale en grille 3 colonnes asymetriques
- Interface composee de cartes arrondies semi-transparentes
- Effet glassmorphism partout
- Rehauts de lumiere bleu, violet, cyan et rose
- Texte blanc ou gris clair
- Labels/petits titres en uppercase ou semi-uppercase

### Barre superieure
- Large carte horizontale en haut centre pour la recherche
- Titre visible: RECHERCHE INTELLIGENTE SERVICES
- Champ de recherche long avec placeholder en francais
- Bouton Rechercher a droite
- Bloc separe en haut a droite avec trois boutons ronds

### Colonne gauche
- Carte Profil en haut avec avatar circulaire et nom utilisateur
- Bloc Categorie Produits avec liste verticale de boutons/pills:
  - Nourriture
  - Pharmacie
  - Telephone
  - Jeux video
  - Vente mobilier
  - Vetements
- Bloc Categorie Services en dessous avec liste verticale similaire

### Colonne centre
- Quatre cartes d'information sur la premiere rangee:
  - Panier
  - Statistiques vente
  - Derniere commande
  - une carte vide/etat selon contenu
- Deux grands blocs horizontaux dessous:
  - Articles en vente
  - Services en vente
- Etat vide visible dans les deux blocs: aucun article/service en vente pour le moment

### Colonne droite
- Bloc Annonces avec compteur
- Encadre Publier une annonce
- Bloc Conseils d'utilisation avec pagination 1/5
- Boutons Precedent et Suivant
- Bloc Fil d'actualite / Actualites Kin-Sel

## Ton visuel a reproduire
- ambiance premium nocturne
- dashboard marketplace africain moderne
- sensation de produit deja actif et dense
- pas de hero marketing classique
- pas de landing page vide
- pas de cartes blanches simples
- pas de style SaaS generique clair

## Details de style a verrouiller
- rayon de bordure moyen a fort, entre 16px et 24px visuellement
- bordures translucides bleutees
- fonds de cartes en degrade bleu/violet legerement brumeux
- ombres diffuses et lumieres internes
- grosses marges internes mais interface compacte
- texte principal blanc
- texte secondaire gris bleute
- accent rose pour certains titres
- accent vert pour certains labels statistiques
- accent cyan pour certains panneaux d'information

## Contraintes de reconstruction
- reproduire l'apparence avant de refactorer le backend
- accepter temporairement des donnees mockees si necessaire
- viser une copie visuelle fidele avant toute simplification technique
- decoupler reconstruction visuelle et branchement base de donnees

## Pages a documenter plus tard
Quand d'autres captures seront disponibles, creer une fiche de meme format pour:
- login
- inscription
- profil utilisateur
- detail annonce
- boutique publique
- dashboard business
- messagerie
- autres vues observees sur Vercel

## Strategie recommandee pour la suite
1. Creer un nouveau dossier propre Kin-Sell apres redemarrage.
2. Reprendre cette archive comme reference unique de l'ancien visuel.
3. Refaire d'abord la home avec donnees statiques.
4. Valider la fidelite visuelle.
5. Produire ensuite des prompts separes page par page pour un autre agent/Codex.
6. Rebrancher seulement ensuite backend et base de donnees.