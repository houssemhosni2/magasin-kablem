// Import d'essai MÉLANGÉ LIV-2026-0117 : les 6 bobines de LIV-2026-0113 et les 14 de LIV-2026-0116 dans un même import
// (20 petites bobines, tickets réels Coficab).
// Efface tout ce que les essais ont créé pour ces bobines, y compris les imports séparés LIV-2026-0113 et LIV-2026-0116
// (sinon les mêmes tickets seraient attendus dans deux imports), puis recrée LIV-2026-0117 côté Italie :
// il réapparaît sur le web au clic sur « Synchroniser ».
//   node scripts/reset-import-mixte.js
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const NUMERO = 'LIV-2026-0117';
const ANCIENS = ['LIV-2026-0113', 'LIV-2026-0116']; // imports séparés remplacés par celui-ci
// [référence, lot, quantité]
const PRODUITS = [
  // ex-LIV-2026-0113
  ['CFLR9YAT30035800002T', '202614133', 6],
  // ex-LIV-2026-0116
  ['CFLR2XBT30250655502T', '202614259', 2],
  ['CFLR2XBT30250404502T', '202614259', 2],
  ['CFLR2XBT30250054002T', '202614259', 1],
  ['CFLR2XBT30050050002T', '202614258', 2],
  ['CFLR2XBT30250054002T', '202614258', 2],
  ['CFLR2XBT30050654502T', '202614258', 1],
  ['CFLR2XBT30250654502T', '202614258', 1],
  ['CFLR2XBT30250654002T', '202614258', 1],
  ['CFLR2XBT30250404502T', '202614258', 1],
  ['CFLR2XBT30250054502T', '202614258', 1],
];
const REFS = [...new Set(PRODUITS.map((p) => p[0]))];
const LOTS = [...new Set(PRODUITS.map((p) => p[1]))];
const NUMEROS = [NUMERO, ...ANCIENS];

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  try {
    await c.beginTransaction();
    const [imports] = await c.query('SELECT id FROM imports WHERE numero_livraison IN (?)', [NUMEROS]);
    const i = imports.length ? imports.map((x) => x.id) : [0];
    // lignes de stock de ces bobines : celles des imports, et celles des mêmes références et lots ailleurs (ex. inventaire)
    const [recs] = await c.query('SELECT id FROM receptions WHERE import_id IN (?) OR (reference IN (?) AND lot IN (?))', [i, REFS, LOTS]);
    const r = recs.length ? recs.map((x) => x.id) : [0];
    const n = {};
    const supprimer = async (nom, sql, p) => (n[nom] = (await c.query(sql, p))[0].affectedRows);
    await supprimer('preparations',
      'DELETE FROM preparations_export WHERE id IN (SELECT preparation_id FROM (SELECT preparation_id FROM preparation_lignes WHERE reception_id IN (?)) x)', [r]);
    await supprimer('sorties',
      'DELETE FROM exports WHERE id IN (SELECT export_id FROM (SELECT export_id FROM export_details WHERE reception_id IN (?)) x)', [r]);
    await supprimer('scans', 'DELETE FROM controles_mobile WHERE (reference IN (?) AND lot IN (?)) OR import_id IN (?) OR reception_id IN (?)', [REFS, LOTS, i, r]);
    await supprimer('reclamations', 'DELETE FROM reclamations WHERE import_id IN (?) OR reception_id IN (?)', [i, r]);
    await supprimer('historique', 'DELETE FROM mouvements_emplacement WHERE reception_id IN (?)', [r]);
    await supprimer('imports', 'DELETE FROM imports WHERE id IN (?)', [i]); // produits, palettes et emplacements suivent (cascade)
    await supprimer('autres_lignes', 'DELETE FROM receptions WHERE id IN (?)', [r]);
    await supprimer('italie', 'DELETE FROM italie_imports WHERE numero IN (?)', [NUMEROS]);
    const [ins] = await c.query('INSERT INTO italie_imports (numero, date_envoi, commentaire) VALUES (?, NOW(), ?)',
      [NUMERO, 'Essai mélangé : 6 CFLR9YAT… (ex-LIV-2026-0113) + 14 CFLR2XBT… (ex-LIV-2026-0116)']);
    for (const [reference, lot, quantite] of PRODUITS) {
      // sans type : comme la base de l'Italie, le type vient du catalogue Articles à la synchronisation
      await c.query(
        'INSERT INTO italie_produits (italie_import_id, type, taille_bobine, reference, lot, quantite) VALUES (?, NULL, NULL, ?, ?, ?)',
        [ins.insertId, reference, lot, quantite]
      );
    }
    await c.commit();
    console.log('Effacé :', JSON.stringify(n));
    console.log(`${NUMERO} recréé (${PRODUITS.reduce((t, p) => t + p[2], 0)} bobines, ${PRODUITS.length} lignes) : cliquez sur « Synchroniser » dans Imports.`);
  } catch (e) {
    await c.rollback();
    console.error('Annulé, rien n\'a changé :', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
