# Journal des changements

Ce journal suit le format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Il commence à être tenu à partir du 7 septembre 2026 ; l'historique complet et détaillé du projet avant cette date reste consultable via `git log`, et les spécifications des grandes fonctionnalités vivent sous `docs/superpowers/specs/`.

Le projet n'a pas encore de première version publique numérotée (`package.json` reste à `0.0.1`) ; les entrées ci-dessous sont regroupées sous **Non publié** jusqu'à la première mise en production formelle.

## Non publié

### Ajouté

- Deux carnets scolaires annuels (3e cycle et secondaire, primaire) imprimant les trois trimestres d'une année sur un seul document, avec décisions de fin d'année et signatures.
- Éditeur de modèle de bulletin : mise en page en colonne latérale ajustable, options de couverture (cadre, position du logo, champs Élève/NISU), variables de texte (`{eleve}`, `{classe}`, `{annee}`, `{periode}`, `{ecole}`).
- Champ de texte libre du bulletin enrichi (gras, italique, souligné, taille, listes, alignement), édité dans une fenêtre modale dédiée ; le contenu est stocké comme un document structuré, jamais comme du HTML.
- Un modèle de bulletin assigné à un niveau s'applique désormais automatiquement à tous les élèves de ce niveau.
- Module Personnel : création unifiée d'un profil enseignant et/ou d'un profil de gestion (avec ou sans email) en un seul appel, plusieurs rôles cumulables par membre.

### Modifié

- Panneau d'édition du bulletin : les onglets Style/Contenu/Espacement/Ce bloc et les réglages d'alignement passent de menus déroulants à des boutons à icônes, plus rapides à lire d'un coup d'œil.
- Formulaire de matière découpé en assistant à 4 étapes.
- Barre latérale de navigation : les sections restent ouvertes jusqu'à fermeture explicite par l'utilisateur, le pied (abonnement + profil) reste toujours visible pendant que la navigation défile.

### Corrigé

- Le logo de l'établissement se replie sur le cadre par défaut au lieu d'afficher une image cassée lorsqu'il ne peut pas être chargé (une seule tentative de rechargement, puis repli).
- Les deux-points après « Nom (s) et Prénom (s) » et « Classe » manquaient sur la grille annuelle des carnets.
