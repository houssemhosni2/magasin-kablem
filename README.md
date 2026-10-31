# Magasin Kablem

Application de gestion de magasin : **Angular** (frontend) + **Node.js / Express** (backend) + **MySQL** (base de données).

```
magasin-kablem/
├── frontend/          Angular 20  → http://localhost:4200
├── backend/           Node.js + Express → http://localhost:3000/api
│   ├── database/schema.sql   script de création de la base
│   └── .env                  configuration MySQL
└── package.json       scripts pour lancer les deux ensemble
```

## Installation (une seule fois)

1. Mettre le mot de passe MySQL dans `backend/.env` (`DB_PASSWORD=...`) ainsi qu'une clé secrète `JWT_SECRET=...` (voir `.env.example`).
2. Créer la base :
   ```
   mysql -u root -p < backend/database/schema.sql
   ```
   (ou ouvrir `schema.sql` dans MySQL Workbench et l'exécuter)
3. **Base déjà créée avant les modules stock / import / export / emplacements ?** Exécuter une seule fois :
   ```
   mysql -u root -p < backend/database/migration-002-stock.sql
   ```
4. **Base créée avant les imports multi-produits ?** Exécuter une seule fois :
   ```
   mysql -u root -p < backend/database/migration-003-imports.sql
   ```
5. (Optionnel, base neuve) Données d'exemple : `mysql -u root -p < backend/database/exemples-stock.sql`

## Lancer le projet

```
npm run dev
```
Lance le backend et Angular en même temps. Ouvrir http://localhost:4200

Autres commandes : `npm run backend`, `npm run frontend`, `npm run install:all`.

## Connexion

Compte administrateur par défaut : matricule **admin**, mot de passe **admin**.
L'admin crée les comptes des magasiniers depuis le menu **Administration → Utilisateurs** ; chaque magasinier se connecte ensuite avec son matricule et son mot de passe.
Toutes les routes `/api/produits` et `/api/categories` exigent l'en-tête `Authorization: Bearer <token>`.

## API

| Méthode | URL                    | Rôle                  |
|---------|------------------------|-----------------------|
| GET     | /api/health            | test connexion MySQL  |
| POST    | /api/auth/login        | connexion (JWT)       |
| GET     | /api/auth/me           | utilisateur connecté  |
| GET     | /api/utilisateurs      | liste (admin)         |
| POST    | /api/utilisateurs      | créer un compte (admin) |
| PUT     | /api/utilisateurs/:id  | modifier (admin)      |
| DELETE  | /api/utilisateurs/:id  | supprimer (admin)     |
| GET     | /api/produits          | articles + stock par emplacement |
| GET     | /api/produits/:id      | un produit            |
| POST    | /api/produits          | ajouter               |
| PUT     | /api/produits/:id      | modifier              |
| DELETE  | /api/produits/:id      | supprimer             |
| GET     | /api/emplacements      | emplacements + contenu |
| POST/PUT/DELETE | /api/emplacements[/:id] | gérer les emplacements |
| GET     | /api/mouvements?type=import\|export | historique |
| POST    | /api/mouvements        | enregistrer un import ou un export |
| GET     | /api/imports           | imports (arrivages) et leurs produits |
| POST    | /api/imports           | nouvel import (en attente) |
| DELETE  | /api/imports/:id       | supprimer un import en attente |
| POST    | /api/imports/:id/produits | ajouter un produit à un import en attente |
| DELETE  | /api/imports/:id/produits/:produitId | retirer un produit |
| GET     | /api/imports/:id/plan-rangement | emplacement proposé pour chaque produit (règles de rangement) |
| POST    | /api/imports/:id/ajouter-au-stock | ajouter l'import au stock et ranger ses produits (`placements` optionnels) ; verrouillé ensuite |
| GET     | /api/stock             | palettes en stock, classées par référence puis FIFO |
| PUT     | /api/stock/:id/emplacement | changer l'emplacement (code, TAMPON ou null) |
| POST    | /api/stock/ranger-automatiquement | ranger la zone tampon et les produits sans emplacement |
| GET     | /api/categories        | liste des catégories  |
| POST    | /api/categories        | ajouter               |
| DELETE  | /api/categories/:id    | supprimer             |
