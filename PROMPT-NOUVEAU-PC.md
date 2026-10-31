# Prompt à donner à Claude sur le nouveau PC

1. Installer Claude Code (ou ouvrir VS Code avec l'extension Claude Code).
2. Ouvrir un **dossier vide**, par exemple `C:\Users\<vous>\Desktop`.
3. Copier-coller le texte ci-dessous à Claude.

---

```
Bonjour Claude. Je change de PC : je veux installer ici mon projet « Magasin Kablem »
(gestion du magasin de Kab-lem Tunisia : backend Node.js/Express + MySQL, web Angular 20,
mobile Ionic/Angular 20). Réponds-moi en français.

Le projet est sur GitHub : https://github.com/houssemhosni2/magasin-kablem

Fais tout, dans l'ordre, et dis-moi à chaque étape ce que tu fais :
1. Vérifie ce qui est installé sur ce PC : Node.js (version 20 ou plus), MySQL Server 8, Git.
   Installe ce qui manque avec winget (voir README section 2.1). Pour MySQL, demande-moi
   le mot de passe root que je veux choisir, ne l'invente pas.
2. Clone le dépôt GitHub dans ce dossier, puis lis README.md et CLAUDE.md du projet.
3. Installe toutes les dépendances : npm run install:all
4. Crée backend/.env à partir de backend/.env.example : mets mon mot de passe MySQL
   et un JWT_SECRET long et aléatoire.
5. Restaure la base complète avec toutes mes données : npm run base:restaurer
6. Lance les tests (npm test) : ils doivent tous passer. S'il y a une erreur, corrige l'environnement
   (pas le code) et explique-moi.
7. Lance l'application : l'API et le web (npm run dev), puis le mobile (demarrer-mobile.bat),
   et donne-moi l'adresse à ouvrir sur mon téléphone (https://ADRESSE-DU-PC:8100, même Wi-Fi).
8. À la fin, fais-moi un résumé : versions installées, ce qui marche, ce qu'il me reste à faire.

Ne committe et ne pousse rien sur GitHub sans me le demander.
```

---

## Si quelque chose bloque

- **« mysql » ou « node » introuvable** après l'installation : fermer et rouvrir le terminal (ou VS Code).
- **Mot de passe MySQL oublié** : réinstaller MySQL Server, ou demander à Claude comment le réinitialiser.
- **Le téléphone n'ouvre pas la page** : PC et téléphone sur le même Wi-Fi, accepter l'avertissement de certificat,
  autoriser Node.js dans le pare-feu Windows (réseaux privés).
- **Mettre à jour la base sur GitHub depuis l'ancien PC** avant de changer : demander à Claude
  « exporte la base (npm run base:exporter) puis committe et pousse sur GitHub ».
