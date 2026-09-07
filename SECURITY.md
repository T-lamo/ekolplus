# Politique de sécurité

Schoolgesti traite des données réelles d'élèves (dossiers scolaires, présences, notes) et des paiements de frais de scolarité. Une vulnérabilité ici a un impact direct sur de vraies personnes — merci de nous laisser la corriger avant toute divulgation publique.

## Signaler une vulnérabilité

Écrivez à **contact@schoolgesti.com** avec :

- une description du problème et de son impact potentiel ;
- les étapes pour le reproduire (ou une preuve de concept minimale) ;
- l'environnement concerné si vous le savez (schoolgesti.com en production, testing.schoolgesti.com en test).

Merci de ne pas ouvrir d'issue publique ni de publier les détails avant qu'un correctif soit déployé. Nous accusons réception sous quelques jours ouvrés et vous tenons informé de l'avancement jusqu'à la résolution.

**Hors périmètre** : les vulnérabilités touchant un fournisseur tiers (Stripe, Cloudinary, Resend, Neon, Google OAuth) doivent être signalées directement à ce fournisseur, pas à nous — nous relayons volontiers si vous n'êtes pas sûr de qui contacter.

## Versions couvertes

Il n'y a pas de versions maintenues en parallèle : seule la version actuellement déployée sur `main` (schoolgesti.com) est en production et reçoit des correctifs de sécurité. `develop` (testing.schoolgesti.com) est un environnement de test, pas destiné à des données réelles d'établissements clients.

## Ce qui est déjà en place

Pour donner un contexte avant de signaler quelque chose (voir aussi les invariants détaillés dans [CLAUDE.md](CLAUDE.md)) :

- **Authentification** — cookies `httpOnly` + `Secure` (prod) + `SameSite=Lax`, JWT d'accès (15 min) et de rafraîchissement (7 j, scope `/api/auth`), CSRF à double soumission sur toute route mutante.
- **Limitation de débit** — par IP et par identifiant (email/nom d'utilisateur), avec verrouillage progressif sur les tentatives de connexion échouées.
- **Autorisation** — RBAC par établissement, deny-by-default : un membre sans rôle explicite ou sans permission n'a accès à rien ; un compte non-membre d'un établissement reçoit 404, pas 403, pour ne pas révéler l'existence de l'établissement.
- **Isolation multi-établissement** — chaque requête est scopée à l'établissement de l'appelant (`resolveMySchool()`), jamais à un identifiant passé en paramètre.
- **Paiements** — traités par Stripe, jamais de numéro de carte sur nos serveurs ; les clés de test et de production sont dans des fichiers d'environnement séparés et ne se mélangent jamais.
- **Secrets** — chiffrement AES-256-GCM pour les champs sensibles stockés (jetons OAuth, secrets d'intégration) ; aucun `.env` réel n'est versionné.
- **En-têtes de sécurité** — Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` sur toutes les réponses.
- **Audit** — toute action du back-office SUPERADMIN est journalisée (qui, quoi, quand) et non contournable.
- **Dépendances** — la CI échoue sur toute vulnérabilité de sévérité haute ou critique dans les dépendances de production (`pnpm audit --prod --audit-level=high`).
