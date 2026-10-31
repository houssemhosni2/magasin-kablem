// Copie complète de la base (tables + toutes les données : catalogue, stock, imports, historique, comptes)
// dans backend/database/donnees/magasin_kablem.sql, pour la retrouver sur un autre PC (npm run base:restaurer).
//   node scripts/exporter-base.js        (npm run base:exporter à la racine)
// Demande mysqldump (fourni avec MySQL Server) dans le PATH.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE = process.env.DB_NAME || 'magasin_kablem';
const sortie = path.join(__dirname, '..', 'database', 'donnees', `${BASE}.sql`);
fs.mkdirSync(path.dirname(sortie), { recursive: true });

try {
  // mot de passe passé par l'environnement, jamais sur la ligne de commande
  const sql = execFileSync('mysqldump', [
    '-h', process.env.DB_HOST || 'localhost', '-P', String(process.env.DB_PORT || 3306), '-u', process.env.DB_USER || 'root',
    '--databases', BASE, '--single-transaction', '--routines', '--triggers', '--default-character-set=utf8mb4',
    '--skip-dump-date', '--skip-extended-insert',
  ], { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD ?? '' }, maxBuffer: 512 * 1024 * 1024 });
  fs.writeFileSync(sortie, sql);
  console.log(`Base ${BASE} copiée dans ${sortie} (${Math.round(sql.length / 1024)} Ko).`);
} catch (e) {
  console.error('Copie impossible :', e.message);
  process.exitCode = 1;
}
