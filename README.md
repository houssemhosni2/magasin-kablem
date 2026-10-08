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

1. Mettre le mot de passe MySQL dans `backend/.env` (`DB_PASSWORD=...`).
2. Créer la base :
   ```
   mysql -u root -p < backend/database/schema.sql
   ```
   (ou ouvrir `schema.sql` dans MySQL Workbench et l'exécuter)

## Lancer le projet

```
npm run dev
```
Lance le backend et Angular en même temps. Ouvrir http://localhost:4200

Autres commandes : `npm run backend`, `npm run frontend`, `npm run install:all`.

## API

| Méthode | URL                    | Rôle                  |
|---------|------------------------|-----------------------|
| GET     | /api/health            | test connexion MySQL  |
| GET     | /api/produits          | liste des produits    |
| GET     | /api/produits/:id      | un produit            |
| POST    | /api/produits          | ajouter               |
| PUT     | /api/produits/:id      | modifier              |
| DELETE  | /api/produits/:id      | supprimer             |
| GET     | /api/categories        | liste des catégories  |
| POST    | /api/categories        | ajouter               |
| DELETE  | /api/categories/:id    | supprimer             |
