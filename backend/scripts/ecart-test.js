// Démo du bouton « Synchroniser » (Gestion de stock) : crée volontairement des écarts entre
// le stock du magasin et la base, puis les annule. Rien n'est perdu : l'état d'origine est
// sauvegardé dans scripts/ecart-sauvegarde.json et remis en place par « annuler ».
// Usage : node scripts/ecart-test.js creer | annuler
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mysql = require('mysql2/promise');
const R = require('../src/rangement');

const SAUVEGARDE = path.join(__dirname, 'ecart-sauvegarde.json');

async function connexion() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'magasin_kablem',
  });
}

async function creer(c) {
  if (fs.existsSync(SAUVEGARDE)) {
    console.log('  Des écarts de test existent déjà. Lancez d\'abord « annuler » (ecart-annuler.bat).');
    return;
  }
  const [placements] = await c.query(
    `SELECT p.id, p.reception_id, p.emplacement, p.quantite, r.reference, r.lot, r.type
     FROM placements p JOIN receptions r ON r.id = p.reception_id
     JOIN imports i ON i.id = r.import_id AND i.statut = 'ajoute'
     WHERE p.emplacement IS NOT NULL ORDER BY p.id`
  );
  const sauvegarde = [];

  // Écart 1 : un produit « disparu » du stock (quantité diminuée de 1)
  const manque = placements.find((p) => p.quantite >= 2 && p.type !== 'connecteur') ?? placements[0];
  if (!manque) throw new Error('Aucun produit rangé dans le stock : impossible de créer un écart');
  sauvegarde.push({ id: manque.id, emplacement: manque.emplacement, quantite: manque.quantite });
  if (manque.quantite >= 2) {
    await c.query('UPDATE placements SET quantite = quantite - 1 WHERE id = ?', [manque.id]);
  } else {
    await c.query('DELETE FROM placements WHERE id = ?', [manque.id]);
    sauvegarde[0].supprime = true;
    sauvegarde[0].reception_id = manque.reception_id;
  }
  console.log(`  - Écart de quantité : ${manque.reference} lot ${manque.lot} en ${manque.emplacement}, 1 produit en moins dans le stock`);

  // Écart 2 : une bobine posée au mauvais niveau (sur un emplacement de cosses libre)
  const bobine = placements.find((p) => p.type === 'bobine' && p.id !== manque.id);
  if (bobine) {
    const occupes = new Set(placements.map((p) => p.emplacement));
    const libre = R.emplacementsParProximite(1).find((code) => !occupes.has(code));
    if (libre) {
      sauvegarde.push({ id: bobine.id, emplacement: bobine.emplacement, quantite: bobine.quantite });
      await c.query('UPDATE placements SET emplacement = ? WHERE id = ?', [libre, bobine.id]);
      console.log(`  - Mauvais niveau : bobine ${bobine.reference} lot ${bobine.lot} déplacée de ${bobine.emplacement} vers ${libre} (niveau des cosses)`);
    }
  }

  fs.writeFileSync(SAUVEGARDE, JSON.stringify(sauvegarde, null, 2));
  console.log('\n  Écarts créés. Dans Gestion de stock, cliquez sur « Synchroniser » : le résultat passe au rouge.');
  console.log('  Pour tout remettre en ordre : ecart-annuler.bat');
}

async function annuler(c) {
  if (!fs.existsSync(SAUVEGARDE)) {
    console.log('  Aucun écart de test à annuler.');
    return;
  }
  const sauvegarde = JSON.parse(fs.readFileSync(SAUVEGARDE, 'utf8'));
  for (const s of sauvegarde) {
    if (s.supprime) {
      await c.query('INSERT INTO placements (id, reception_id, emplacement, quantite) VALUES (?, ?, ?, ?)', [s.id, s.reception_id, s.emplacement, s.quantite]);
    } else {
      await c.query('UPDATE placements SET emplacement = ?, quantite = ? WHERE id = ?', [s.emplacement, s.quantite, s.id]);
    }
  }
  fs.unlinkSync(SAUVEGARDE);
  console.log(`  ${sauvegarde.length} écart(s) annulé(s) : le stock correspond de nouveau à la base.`);
  console.log('  Cliquez sur « Synchroniser » : le résultat repasse au vert.');
}

(async () => {
  const action = process.argv[2];
  if (!['creer', 'annuler'].includes(action)) {
    console.log('  Usage : node scripts/ecart-test.js creer | annuler');
    return;
  }
  const c = await connexion();
  try {
    await c.beginTransaction();
    await (action === 'creer' ? creer(c) : annuler(c));
    await c.commit();
  } catch (err) {
    await c.rollback();
    throw err;
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error('  ERREUR :', e.message);
  process.exitCode = 1;
});
