# Magasin Kab-lem — application mobile

Contrôle du travail du magasinier avec la caméra du téléphone. Après la connexion : **Import** ou **Export**.

**Import**

- **Réception** (contrôle 1) : scan du ticket vert → conforme (vert + emplacement prévu en grand), écart de quantité (orange), produit inconnu ou ticket déjà traité (rouge).
- **Rangement** (contrôle 2) : scan de l'emplacement puis du ticket → bon emplacement (vert) ou « Ce n'est pas son emplacement » (rouge, tentative journalisée, rien dans le stock).
- **Consulter** : contenu d'un emplacement, avancement d'un produit.
- **En attente** : scans gardés sur le téléphone quand le Wi-Fi est coupé, envoyés automatiquement au retour du réseau (jamais comptés deux fois).

**Export** (sortie vers la production)

1. Le magasinier saisit la référence (ou scanne un ticket), la quantité et la destination (P1, P2, P3, CET, MCW).
2. L'API impose le FIFO, avec les mêmes règles que la page Export du web : elle affiche la liste des prélèvements (emplacement, lot, quantité), les plus anciens d'abord, et les réserve.
3. Pour chaque prélèvement : scan de l'emplacement, puis du ticket du produit pris.
   - bon emplacement + bon lot : vert, prélèvement validé ;
   - mauvais emplacement : rouge « Ce n'est pas son emplacement » ;
   - mauvaise référence, ou lot qui n'est pas le plus ancien (FIFO) : rouge « Mauvais produit », avec le bon lot à prendre.
   Chaque alerte est journalisée (journal des contrôles).
4. Au dernier prélèvement validé, la sortie est enregistrée comme sur le web (historique Export, places libérées).
   Si le stock a changé entre-temps (sortie faite depuis le web), rien ne sort et la sortie est à refaire.

Une sortie commencée est reprise à la réouverture de l'application ; elle expire après 2 heures sans être terminée.
La sortie demande le réseau : chaque prise est validée tout de suite.

Toutes les règles sont dans l'API (`backend/src/routes/mobile.js`). L'application web n'est pas modifiée.
Option (a) : le stock reste alimenté par « Ajouter au stock » dans le web ; le mobile contrôle et trace.

## 1. Avant le premier lancement : la base de données

Relire puis exécuter les migrations, dans l'ordre (elles ne modifient aucune table du web) :

```
backend/database/mobile/migration-013-controles-mobile.sql   (contrôles et journal)
backend/database/mobile/migration-014-export-mobile.sql      (sorties préparées sur le mobile)
```

## 2. Tester sur le téléphone (réseau du magasin)

1. Démarrer l'API : `cd backend` puis `npm run dev` (port 3000).
2. Démarrer l'application mobile : `cd mobile` puis `npm start`.
   Elle s'ouvre en **HTTPS** sur le port 8100 (la caméra du téléphone l'exige) et relaie `/api` vers l'API :
   le téléphone n'a besoin que d'une seule adresse, pas de problème de « contenu mixte ».
3. Le terminal affiche les adresses, par exemple `https://192.168.100.42:8100`.
   Ouvrir cette adresse dans Chrome sur le téléphone (même Wi-Fi que le PC).
4. Le certificat de test n'est pas reconnu : « Paramètres avancés » → « Continuer vers le site ».
5. Autoriser la caméra quand le navigateur la demande.
6. Se connecter avec un matricule et un mot de passe de l'application web.

Si le téléphone n'arrive pas à ouvrir la page : autoriser Node.js dans le pare-feu Windows (réseau privé) pour le port 8100.

Pour essayer sans ticket : « QR illisible ? Saisie manuelle », puis `F0411;202613252;3` (référence;lot;quantité).
Ces scans sont marqués « saisie manuelle » dans le journal.

## 3. Adresse de l'API

Elle est dans `src/assets/config.json` (jamais `localhost` : sur le téléphone, c'est le téléphone lui-même) :

```json
{ "apiUrl": "/api" }
```

- En test : `/api` (relayé par `npm start`, voir `proxy.conf.json`).
- En production : l'adresse HTTPS du serveur, ex. `https://magasin.kablem.tn/api`.
  Le fichier peut être modifié après la compilation, dans `www/assets/config.json`.

## 4. En production

La caméra ne fonctionne qu'en HTTPS. Deux possibilités :

**A. Application web (recommandé pour commencer)**
1. `npm run build` → dossier `www/`.
2. Un serveur web (IIS ou nginx) sur le serveur du magasin, avec un **vrai certificat** (domaine de l'entreprise,
   ou certificat interne installé sur les téléphones), qui sert `www/` et relaie `/api` vers l'API Node.
   Une seule adresse HTTPS pour tout : `https://magasin.kablem.tn` (mobile) et `/api`.
3. Ajouter l'origine du mobile dans `backend/.env` si elle est différente : `CORS_ORIGINES=https://magasin.kablem.tn`.
4. Sur le téléphone : Chrome → menu → « Ajouter à l'écran d'accueil ».

L'API peut aussi être servie directement en HTTPS : renseigner `HTTPS_CERT` et `HTTPS_CLE` (fichiers .pem) dans `backend/.env`.

**B. Application Android installée (Capacitor)**
1. `npx cap add android`, puis `npm run build` et `npx cap sync`.
2. Mettre l'adresse HTTPS de l'API dans `www/assets/config.json`.
3. Ouvrir avec Android Studio (`npx cap open android`) et générer l'APK.
   Les origines de l'application installée (`capacitor://localhost`, `https://localhost`) sont déjà autorisées par l'API.

## 5. Format du QR

Le format exact du ticket vert reste à confirmer (photo `docs/ticket-vert.jpg`).
L'API accepte déjà : `F0411;202613252;3`, `CODICE: F0411 | LOTTO: 202613252 | QTA: 3`, ou du JSON.
Une fois le vrai format connu, seule la fonction `lireTicket` de `backend/src/ticket.js` est à adapter (avec ses tests).

QR d'un emplacement : le code seul (`D011`) ou `EMPL:D011`.

## 6. Tests automatiques (API)

```
cd backend
npm test
```

Ils tournent sur une base séparée `magasin_kablem_test`, recréée à chaque lancement (jamais la base réelle).
