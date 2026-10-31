// Crée la base magasin_kablem sur un nouveau PC, en une commande :
//   1. schema.sql (tables, compte administrateur admin / admin) puis toutes les migrations du mobile, dans l'ordre ;
//   2. le catalogue des articles : fichier « DESCRIPTION MP.xlsx », puis les listes du magasin
//      (bobines avec leur taille, cosses avec leur type axiale / plat).
// Refuse de toucher une base qui contient déjà des tables, sauf avec --remplacer (la base est alors effacée).
//   node scripts/creer-base.js              (depuis backend/)
//   node scripts/creer-base.js --remplacer
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const mysql = require('mysql2/promise');

const BASE = process.env.DB_NAME || 'magasin_kablem';
const DOSSIER = path.join(__dirname, '..', 'database');
const remplacer = process.argv.includes('--remplacer');

// Le nom de la base dans les fichiers SQL (« magasin_kablem ») est remplacé par celui de .env
const lire = (fichier) => fs.readFileSync(path.join(DOSSIER, fichier), 'utf8').replace(/\bmagasin_kablem\b/g, BASE);

(async () => {
  if (!process.env.DB_PASSWORD && process.env.DB_PASSWORD !== '') {
    throw new Error('backend/.env manquant : copiez backend/.env.example en backend/.env et remplissez DB_PASSWORD et JWT_SECRET.');
  }
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, multipleStatements: true,
  });
  try {
    const [[{ n }]] = await c.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?', [BASE]);
    if (n && !remplacer) {
      throw new Error(`La base ${BASE} existe déjà (${n} tables) : rien n'est fait. Pour l'effacer et la recréer : node scripts/creer-base.js --remplacer`);
    }
    if (n) await c.query(`DROP DATABASE \`${BASE}\``);

    console.log(`1/2 Base ${BASE} : tables et migrations`);
    await c.query(lire('schema.sql'));
    const migrations = fs.readdirSync(path.join(DOSSIER, 'mobile')).filter((f) => f.endsWith('.sql')).sort();
    for (const f of migrations) {
      await c.query(lire(path.join('mobile', f)));
      console.log(`    ${f}`);
    }
  } finally {
    await c.end();
  }

  console.log('2/2 Catalogue des articles');
  for (const script of ['importer-description-mp.js', 'remplacer-bobines-catalogue.js', 'remplacer-cosses-catalogue.js']) {
    execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', env: process.env });
  }
  console.log(`\nBase ${BASE} prête. Connexion : matricule admin, mot de passe admin (à changer dans Utilisateurs).`);
})().catch((e) => {
  console.error('Erreur :', e.message);
  process.exitCode = 1;
});
