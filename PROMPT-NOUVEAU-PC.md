# Installer Magasin Kablem sur un PC tout neuf, avec Claude

Le PC est neuf : rien n'est installé. Il y a **2 choses à faire à la main** (5 minutes), puis Claude fait tout le reste.

## Étape A — à faire vous-même (une seule fois)

1. Ouvrir **PowerShell en administrateur** : menu Démarrer → taper « PowerShell » → clic droit → « Exécuter en tant qu'administrateur ».
2. Installer Git (Claude Code en a besoin sur Windows) :
   ```powershell
   winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
   ```
   Si `winget` est introuvable : installer « App Installer » depuis le Microsoft Store, puis recommencer.
3. Installer Claude Code :
   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```
4. **Fermer PowerShell**, en rouvrir un nouveau (en administrateur), puis :
   ```powershell
   mkdir C:\Projets
   cd C:\Projets
   claude
   ```
   Se connecter avec son compte Claude quand c'est demandé.

## Étape B — copier-coller ce texte à Claude

```
Bonjour Claude. Réponds-moi toujours en français, simplement.

Ce PC Windows est tout neuf : il n'y a AUCUN environnement de travail (seulement Git et toi).
Je veux que tu installes TOUT et que tu fasses TOUT, jusqu'à ce que mon projet marche comme sur
mon ancien PC. Mon projet : « Magasin Kablem », gestion du magasin de Kab-lem Tunisia
(backend Node.js/Express + MySQL, web Angular 20, mobile Ionic/Angular 20).
Il est sur GitHub : https://github.com/houssemhosni2/magasin-kablem

Fais ces étapes dans l'ordre. Avant chaque étape, dis-moi en une phrase ce que tu vas faire.
Vérifie chaque installation avant de passer à la suivante. Si une commande échoue, trouve
une autre solution toi-même ; ne me demande que ce que toi seul ne peux pas décider.

1. INVENTAIRE : regarde ce qui est déjà installé (winget, git, node, npm, mysql, code, chrome)
   et la version de Windows. Montre-moi le résultat.

2. OUTILS : installe avec winget ce qui manque, en versions stables :
   - Node.js LTS 20 (ou 22)              → winget install OpenJS.NodeJS.LTS
   - MySQL Server 8.0 (Community)        → winget install Oracle.MySQL
   - Visual Studio Code + l'extension Claude Code, et Google Chrome (s'ils manquent)
   Après chaque installation, recharge le PATH (ou ouvre un nouveau terminal) et vérifie la version.

3. MYSQL : il faut un serveur MySQL qui tourne en service Windows, sur le port 3306,
   avec un utilisateur root. DEMANDE-MOI le mot de passe root que je veux (ne l'invente pas).
   Si l'installation par winget n'a pas configuré le serveur, configure-le toi-même
   (initialiser le dossier de données, installer et démarrer le service, mettre le mot de passe root),
   puis vérifie avec : mysql -u root -p -e "SELECT VERSION();"
   Le service MySQL doit démarrer automatiquement avec Windows.

4. PROJET : clone https://github.com/houssemhosni2/magasin-kablem dans C:\Projets,
   puis lis README.md et CLAUDE.md du projet et suis-les.

5. DÉPENDANCES : à la racine du projet, npm run install:all (backend, web, mobile).

6. CONFIGURATION : crée backend\.env à partir de backend\.env.example, avec mon mot de passe
   MySQL et un JWT_SECRET long et aléatoire que tu génères.

7. BASE DE DONNÉES : npm run base:restaurer (copie complète de mes données : catalogue,
   stock, historique, comptes). Vérifie le nombre d'articles et de comptes restaurés.

8. TESTS : npm test → tous les tests doivent passer. Si un test échoue, corrige l'environnement
   (pas le code du projet) et explique-moi la cause.

9. LANCEMENT :
   - lance l'API et le web (npm run dev) et vérifie que http://localhost:4200 répond ;
   - lance le mobile et vérifie que https://localhost:8100 répond ;
   - autorise Node.js dans le pare-feu Windows (réseaux privés) pour que mon téléphone
     puisse ouvrir le mobile ;
   - trouve l'adresse IPv4 du PC (ipconfig) et donne-moi l'adresse à ouvrir sur mon téléphone :
     https://ADRESSE-DU-PC:8100 (téléphone sur le même Wi-Fi que le PC).

10. CONFORT : crée sur le Bureau un raccourci vers demarrer-mobile.bat du projet
    (il lance l'API et le mobile et affiche l'adresse du téléphone).

11. RÉSUMÉ FINAL : versions installées, ce qui marche (avec les adresses), comment relancer
    l'application demain, et ce qu'il me reste à faire (par exemple changer les mots de passe faibles).

Ne committe et ne pousse rien sur GitHub sans me le demander.
```

## Si quelque chose bloque

- **Une commande « introuvable » juste après une installation** (`node`, `mysql`…) : fermer et rouvrir le terminal, puis relancer `claude`.
  Claude peut reprendre où il en était : lui dire « continue l'installation ».
- **Mot de passe MySQL oublié** : demander à Claude « réinitialise le mot de passe root de MySQL ».
- **Le téléphone n'ouvre pas la page** : PC et téléphone sur le même Wi-Fi, accepter l'avertissement de certificat
  sur le téléphone, et vérifier le pare-feu Windows.
- **Avant de quitter l'ancien PC**, mettre la base à jour sur GitHub : demander à Claude, sur l'ancien PC,
  « exporte la base (npm run base:exporter) puis committe et pousse sur GitHub ».
