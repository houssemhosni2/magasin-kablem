// Création de la base de test magasin_kablem_test : schéma complet + migrations du mobile.
// Appelé avant les tests (globalSetup). Refuse de toucher une base qui ne finit pas par _test.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mysql = require('mysql2/promise');

const BASE = 'magasin_kablem_test';

module.exports = async function creerBaseDeTest() {
  if (!BASE.endsWith('_test')) throw new Error('Les tests ne tournent que sur une base _test');
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  const lire = (f) => fs.readFileSync(path.join(__dirname, '..', 'database', f), 'utf8').replace(/\bmagasin_kablem\b/g, BASE);
  await c.query(`DROP DATABASE IF EXISTS ${BASE}`);
  await c.query(lire('schema.sql'));
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'database', 'mobile')).sort()) {
    await c.query(lire(path.join('mobile', f)));
  }
  await c.end();
};
