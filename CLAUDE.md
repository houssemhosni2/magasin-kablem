# Consignes pour Claude — Magasin Kablem

L'utilisateur travaille chez Kab-lem Tunisia et écrit en français : répondre en français, simplement.

## Installer le projet sur un nouveau PC
Suivre `README.md` section 2, dans l'ordre :
1. Vérifier Node.js 20+ (`node -v`), MySQL 8 (`mysql --version`), Git ; sinon les installer avec `winget` (README 2.1).
   Le mot de passe root de MySQL est choisi par l'utilisateur : le lui demander, ne jamais l'inventer ni l'écrire ailleurs que dans `backend/.env`.
2. `npm run install:all` à la racine.
3. Créer `backend/.env` depuis `backend/.env.example` (DB_PASSWORD, et un JWT_SECRET long et aléatoire).
4. `npm run base:restaurer` : restaure la copie complète de la base (`backend/database/donnees/magasin_kablem.sql`, avec stock et comptes).
   Seulement si l'utilisateur veut repartir de zéro : `npm run base` (base neuve, compte admin / admin).
5. `npm test` : les 172 tests doivent passer.
6. Lancer : `npm run dev` (web) ou `demarrer-mobile.bat` (mobile) et donner l'adresse `https://IP-DU-PC:8100` pour le téléphone.

## Règles de travail
- Les tests tournent sur la base `magasin_kablem_test`, jamais sur la vraie base `magasin_kablem`.
- Les migrations (`backend/database/mobile/migration-0xx-*.sql`) ne font qu'ajouter ; numéro suivant : 033.
- Aucun secret dans le code ni sur GitHub (`backend/.env` et `backend/scripts/sauvegardes/` sont ignorés).
- Demander confirmation avant toute action qui efface des données.
- Ne committer ou pousser sur GitHub que si l'utilisateur le demande.
