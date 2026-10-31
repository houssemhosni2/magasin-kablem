// Remet à zéro l'import d'essai LIV-2026-0113 (6 petites bobines CFLR9YAT30035800002T, tickets réels Coficab).
// Efface tout ce que les tests ont créé (import, stock, emplacements, scans mobile, sorties, réclamations),
// puis recrée l'import côté Italie : il réapparaît sur le web au clic sur « Synchroniser ».
//   node scripts/reset-import-6-bobines.js
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const NUMERO = 'LIV-2026-0113';
const REF = 'CFLR9YAT30035800002T';
const LOT = '202614133';
const QUANTITE = 6;

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  try {
    await c.beginTransaction();
    const [imports] = await c.query(
      // seulement l'import d'essai : les autres imports (ex. « Inventaire ») ne perdent que les lignes de cette référence
      'SELECT id FROM imports WHERE numero_livraison = ?',
      [NUMERO]
    );
    const ids = imports.map((i) => i.id);
    const [recs] = ids.length ? await c.query('SELECT id FROM receptions WHERE import_id IN (?) OR reference = ?', [ids, REF]) : [[]];
    const r = recs.length ? recs.map((x) => x.id) : [0];
    const i = ids.length ? ids : [0];
    const n = {};
    const supprimer = async (nom, sql, p) => (n[nom] = (await c.query(sql, p))[0].affectedRows);
    await supprimer('preparations',
      'DELETE FROM preparations_export WHERE reference = ? OR id IN (SELECT preparation_id FROM (SELECT preparation_id FROM preparation_lignes WHERE reception_id IN (?)) x)', [REF, r]);
    await supprimer('sorties',
      'DELETE FROM exports WHERE reference = ? OR id IN (SELECT export_id FROM (SELECT export_id FROM export_details WHERE reception_id IN (?)) x)', [REF, r]);
    await supprimer('scans', 'DELETE FROM controles_mobile WHERE reference = ? OR import_id IN (?) OR reception_id IN (?)', [REF, i, r]);
    await supprimer('reclamations', 'DELETE FROM reclamations WHERE reference = ? OR import_id IN (?) OR reception_id IN (?)', [REF, i, r]);
    await supprimer('historique', 'DELETE FROM mouvements_emplacement WHERE reference = ? OR reception_id IN (?)', [REF, r]);
    await supprimer('imports', 'DELETE FROM imports WHERE id IN (?)', [i]); // produits et emplacements suivent (cascade)
    await supprimer('autres_lignes', 'DELETE FROM receptions WHERE reference = ?', [REF]); // ex. bobines comptées à l'inventaire
    await supprimer('italie', 'DELETE FROM italie_imports WHERE numero = ?', [NUMERO]);
    const [ins] = await c.query('INSERT INTO italie_imports (numero, date_envoi, commentaire) VALUES (?, NOW(), ?)',
      [NUMERO, `Ticket réel Coficab : ${QUANTITE} petites bobines ${REF} (essai)`]);
    await c.query(
      // sans type : comme la base de l'Italie, le type vient du catalogue Articles à la synchronisation
      'INSERT INTO italie_produits (italie_import_id, type, taille_bobine, reference, lot, quantite) VALUES (?, NULL, NULL, ?, ?, ?)',
      [ins.insertId, REF, LOT, QUANTITE]
    );
    await c.commit();
    console.log('Effacé :', JSON.stringify(n));
    console.log(`${NUMERO} recréé (${QUANTITE} × ${REF} lot ${LOT}) : cliquez sur « Synchroniser » dans Imports.`);
  } catch (e) {
    await c.rollback();
    console.error('Annulé, rien n\'a changé :', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
