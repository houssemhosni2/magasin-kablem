# Magasin Kablem

Gestion du magasin de matières premières de **Kab-lem Tunisia** (Menzel Jemil) : bobines, cosses et connecteurs.
Imports d'Italie, réception et rangement par palette sur le mobile, emplacements, sorties FIFO, réclamations, inventaire.

| Partie | Technologie | Adresse en local |
|---|---|---|
| `backend/` | Node.js + Express 5 + MySQL | http://localhost:3000/api |
| `frontend/` | Angular 20 (application web des bureaux) | http://localhost:4200 |
| `mobile/` | Ionic 8 + Angular 20 (magasiniers, scan des QR) | https://localhost:8100 |

---

## 1. Versions utilisées (PC d'origine)

| Outil | Version | Remarque |
|---|---|---|
| Windows | 11 | les scripts `.bat` sont pour Windows |
| **Node.js** | **20.20.0** (LTS 20) | npm 8.19.4 fourni avec ; Node 20.x ou 22.x conviennent |
| **MySQL Server** | **8.0.46** (Community) | utilisateur `root`, port 3306 |
| Git | 2.44 | |
| Angular / Angular CLI | 20.3 | installé par `npm install`, pas besoin d'installation globale |
| TypeScript | 5.9 | installé par `npm install` |
| Ionic Angular | 8.8 ; Capacitor 7 | installé par `npm install` |
| Express | 5.2 ; mysql2 3.24 ; Jest 29 ; nodemon 3 | installé par `npm install` |
| Google Chrome | récent | pour le web ; Chrome sur le téléphone pour le mobile |

## 2. Installer sur un nouveau PC (Windows)

### 2.1 Les outils (une fois)
Dans PowerShell :
```powershell
winget install OpenJS.NodeJS.LTS
winget install Oracle.MySQL
winget install Git.Git
```
Pendant l'installation de MySQL : type « Development Computer », port **3306**, choisir un mot de passe pour **root** (le noter).
Fermer puis rouvrir le terminal, et vérifier : `node -v` (v20 ou plus), `npm -v`, `git --version`, `mysql --version`.

### 2.2 Le projet
```powershell
git clone https://github.com/houssemhosni2/magasin-kablem.git
cd magasin-kablem
npm run install:all
```
`install:all` installe les dépendances de la racine, du backend, du web et du mobile (quelques minutes).

### 2.3 La configuration : `backend/.env`
Copier `backend/.env.example` en `backend/.env` puis remplir :
```
DB_PASSWORD=le mot de passe root de MySQL
JWT_SECRET=une longue phrase secrète au hasard (40 caractères ou plus)
```
Le fichier `.env` n'est jamais envoyé sur GitHub (il est dans `.gitignore`).

### 2.4 La base de données (une commande)
```powershell
npm run base
```
Crée la base `magasin_kablem` : toutes les tables, toutes les migrations dans l'ordre, le compte administrateur, puis le catalogue des articles
(180 bobines avec leur taille, 224 cosses avec leur type axiale/plat, 1000 connecteurs). Le stock est vide.
Si la base existe déjà, rien n'est fait ; `node backend/scripts/creer-base.js --remplacer` l'efface et la recrée.

> **Garder les données du magasin de l'ancien PC** (stock, imports, historique) : elles ne sont pas sur GitHub.
> Sur l'ancien PC : `mysqldump -u root -p --databases magasin_kablem > magasin_kablem.sql`
> Copier le fichier (clé USB), puis sur le nouveau PC, à la place de `npm run base` : `mysql -u root -p < magasin_kablem.sql`

### 2.5 Vérifier
```powershell
npm test
```
Lance les 172 tests du backend sur une base séparée `magasin_kablem_test` (créée et vidée automatiquement : la vraie base n'est jamais touchée).

## 3. Lancer

| Commande (à la racine) | Lance |
|---|---|
| `npm run dev` | API + web → http://localhost:4200 |
| `npm run tout` | API + web + mobile |
| `npm run backend` / `npm run frontend` / `npm run mobile` | une seule partie |
| double-clic sur `demarrer-mobile.bat` | API + mobile dans deux fenêtres, et affiche l'adresse à ouvrir sur le téléphone |

Connexion : matricule **admin**, mot de passe **admin** (à changer tout de suite dans Administration → Utilisateurs).
Rôles : administrateur, chef de magasin, magasinier, planificateur (catalogue des articles seulement).

### Le mobile sur le téléphone
1. Le téléphone et le PC sur le **même réseau** (même Wi-Fi).
2. Trouver l'adresse du PC : `ipconfig` → « Adresse IPv4 » de la carte connectée (`demarrer-mobile.bat` l'affiche).
3. Sur le téléphone, dans Chrome : `https://ADRESSE-DU-PC:8100` → accepter l'avertissement de certificat (certificat de développement).
4. La caméra demande le HTTPS : c'est pour cela que le mobile est servi en `https`.
Le mobile parle à l'API par le relais du serveur de développement (`mobile/proxy.conf.json` : `/api` → `localhost:3000`) : rien à régler.
Si le pare-feu Windows le demande, autoriser Node.js sur les réseaux privés.

## 4. Organisation du code

```
magasin-kablem/
├── backend/
│   ├── src/server.js              démarrage, routes, droits par rôle
│   ├── src/rangement.js           moteur de rangement (règles des emplacements, capacités)
│   ├── src/palettes.js            réception par palette (où poser une palette)
│   ├── src/routes/                API (imports, stock, mobile-*, ranger, articles, journal…)
│   ├── database/schema.sql        tables de départ + compte admin
│   ├── database/migration-0xx     anciennes migrations (déjà incluses dans schema.sql)
│   ├── database/mobile/           migrations 013 à 032 (appliquées par npm run base)
│   ├── scripts/                   création de la base, catalogue, imports d'essai
│   └── tests/                     tests Jest (base magasin_kablem_test)
├── frontend/src/app/pages/        pages web (import, stock, emplacements, articles, journal…)
├── mobile/src/app/pages/          écrans mobile (réception, rangement, export, ranger, inventaire…)
├── docs/                          PDF et PowerPoint (règles de rangement, cas, étiquettes)
└── DESCRIPTION MP.xlsx            catalogue d'origine des articles (lu par npm run base)
```

Une nouvelle migration va dans `backend/database/mobile/` avec le numéro suivant (`migration-033-….sql`) :
elle doit seulement ajouter (tables, colonnes, valeurs), sans perdre de données. `npm run base` et les tests l'appliquent automatiquement.

## 5. Règles du magasin (résumé)

- Plan : blocs A-D, niveaux 0-4, emplacements `C215` (bloc C, niveau 2, n° 15) ; zone tampon `T01…` au sol. 1 emplacement = 1 palette.
- Niveau 0 : bobines — 6 petites, 2 moyennes ou 1 grande par palette (une seule taille ; taille donnée par le catalogue Articles).
- Niveaux 1-2 : cosses — 10 plates **et** 3 axiales par palette, comptées à part. Les plates arrivent par palette, les axiales une par une.
- Niveaux 3-4 : connecteurs — limités par le volume et le poids (réglables).
- Réception d'une palette : un emplacement entièrement vide d'abord, sinon colis par colis sur les palettes commencées, sinon la zone tampon.
- Sorties : FIFO imposé (plus petit lot, puis réception la plus ancienne).
- « Ranger le magasin » : le magasinier déplace librement (ticket → départ → arrivée) ; l'application contrôle et historise tout avec le matricule.

## 6. Scripts utiles (`backend/scripts/`)

| Script | Rôle |
|---|---|
| `creer-base.js` | crée la base complète (`npm run base`) |
| `importer-description-mp.js` | relit `DESCRIPTION MP.xlsx` |
| `remplacer-bobines-catalogue.js` / `remplacer-cosses-catalogue.js` | listes du magasin (taille des bobines, type des cosses) |
| `reset-import-6-bobines.js`, `reset-import-14-bobines.js`, `reset-import-mixte.js` | imports d'essai (puis « Synchroniser » dans Import) |
| `garder-dernier-import.js` | efface tous les imports sauf le dernier (sauvegarde d'abord) |
| `etiquettes-emplacements.js` | PDF des étiquettes QR des emplacements |

Les scripts qui effacent des données font d'abord une sauvegarde dans `backend/scripts/sauvegardes/` (jamais envoyée sur GitHub).
