# Prompt Codex - Reconstruction Visuelle Home Ancien Kin-Sel

Utilise ce prompt pour demander a un autre agent de reconstruire la page home de l'ancien Kin-Sel avec un rendu visuel quasi identique a la reference Vercel.

## Prompt
Tu reconstruis la page home de Kin-Sell a l'identique du point de vue visuel, sans reinventer le design.

Objectif:
- reproduire une interface dashboard sombre et dense
- obtenir une mise en page tres proche de la reference
- prioriser la fidelite visuelle sur la logique metier
- utiliser des donnees mockees si necessaire

Contraintes visuelles non negociables:
- theme sombre bleu nuit quasi noir
- interface en glassmorphism premium
- cartes a coins tres arrondis
- fonds de cartes en degradés bleus, violets, roses et cyan tres subtils
- bordures translucides bleutees
- typographie blanche ou gris clair
- look compact, riche, sans grands vides
- aucun hero marketing classique
- aucune landing page de presentation

Structure exacte a viser:
- une barre de recherche intelligente en haut centre
- un bloc d'actions rondes en haut a droite
- une colonne gauche avec:
  - carte profil
  - carte categorie produits avec liste verticale de categories
  - carte categorie services avec liste verticale de categories
- une colonne centrale avec:
  - premiere rangee de cartes statistiques etats: Panier, Statistiques vente, Derniere commande
  - deux grands blocs horizontaux dessous: Articles en vente et Services en vente
- une colonne droite avec:
  - bloc Annonces
  - bloc Conseils d'utilisation avec pagination et boutons precedent/suivant
  - bloc Fil d'actualite

Textes visibles a conserver ou reproduire tres fidelement:
- RECHERCHE INTELLIGENTE SERVICES
- Rechercher
- PROFIL
- PANIER
- STATISTIQUES VENTE
- DERNIERE COMMANDE
- Annonces
- Publier une annonce
- Conseils d'utilisation
- Passez toujours par le panier
- Precedent
- Suivant
- Fil d'actualite
- Actualites Kin-Sel
- Categories produits avec libelles du type Nourriture, Pharmacie, Telephone, Jeux video, Vente mobilier, Vetements

Direction artistique:
- inspiration tableau de bord marketplace premium
- fort contraste entre fond global et panneaux translucides
- effet lumineux diffus en arriere-plan
- interface credible pour un produit deja en production
- conserver le melange bleu nuit + violet + cyan + rose

Implementation souhaitee:
- React ou Next.js selon le projet cible
- CSS propre via CSS modules, Tailwind ou styled system, mais le resultat doit rester identique visuellement
- composantiser la page par zones: top search, left sidebar, stat cards, feed cards, right sidebar
- utiliser des donnees mockees dans un premier temps

Ce qu'il ne faut pas faire:
- ne pas simplifier en simple dashboard admin generique
- ne pas remplacer le glassmorphism par des cartes opaques
- ne pas blanchir le fond
- ne pas changer la densite ni transformer la page en landing page
- ne pas introduire une identite graphique differente

Livrable attendu:
- une page home visuellement tres proche de la reference
- responsive desktop d'abord, mobile ensuite
- composants reutilisables pour les cartes laterales et les cartes stats

Si une partie manque, privilegie la ressemblance avec cette description plutot qu'une interpretation libre.