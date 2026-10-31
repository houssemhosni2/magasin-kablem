// Efface tous les imports sauf le plus récent (ou celui donné), avec leur stock et tout ce qui s'y rattache :
// emplacements, palettes, plans de rangement, scans du mobile, sorties, réclamations, historique, et leur
// livraison côté Italie (sinon « Synchroniser » la recréerait). Les tables touchées sont d'abord sauvegardées
// en entier dans scripts/sauvegardes/.
//   node scripts/garder-dernier-import.js [numero_livraison]
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const TABLES = [
  'imports', 'receptions', 'placements', 'plans_rangement', 'affectations_colis', 'palettes_reception', 'controles_mobile',
  'reclamations', 'mouvements_emplacement', 'inventaire_scans', 'exports', 'export_details', 'preparations_export',
  'preparation_lignes', 'italie_imports', 'italie_produits',
];

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  try {
    const [[garde]] = process.argv[2]
      ? await c.query('SELECT id, numero_livraison, source_id FROM imports WHERE numero_livraison = ?', [process.argv[2]])
      : await c.query('SELECT id, numero_livraison, source_id FROM imports ORDER BY COALESCE(date_envoi, date_creation) DESC, id DESC LIMIT 1');
    if (!garde) throw new Error('Import à garder introuvable');

    const sauvegarde = {};
    for (const t of TABLES) sauvegarde[t] = (await c.query(`SELECT * FROM ${t}`))[0];
    const dossier = path.join(__dirname, 'sauvegardes');
    fs.mkdirSync(dossier, { recursive: true });
    const fichier = path.join(dossier, `avant-garder-${garde.numero_livraison ?? garde.id}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
    fs.writeFileSync(fichier, JSON.stringify(sauvegarde));

    await c.beginTransaction();
    const [imports] = await c.query('SELECT id, source_id FROM imports WHERE id <> ?', [garde.id]);
    const i = imports.length ? imports.map((x) => x.id) : [0];
    const sources = imports.map((x) => x.source_id).filter(Boolean);
    const [recs] = await c.query('SELECT id FROM receptions WHERE import_id IN (?)', [i]);
    const r = recs.length ? recs.map((x) => x.id) : [0];
    const n = {};
    const supprimer = async (nom, sql, p) => (n[nom] = (await c.query(sql, p))[0].affectedRows);
    await supprimer('preparations', 'DELETE FROM preparations_export WHERE id IN (SELECT preparation_id FROM (SELECT preparation_id FROM preparation_lignes WHERE reception_id IN (?)) x)', [r]);
    await supprimer('sorties', 'DELETE FROM exports WHERE id IN (SELECT export_id FROM (SELECT export_id FROM export_details WHERE reception_id IN (?)) x)', [r]);
    await supprimer('scans', 'DELETE FROM controles_mobile WHERE import_id IN (?) OR reception_id IN (?)', [i, r]);
    await supprimer('reclamations', 'DELETE FROM reclamations WHERE import_id IN (?) OR reception_id IN (?)', [i, r]);
    await supprimer('historique', 'DELETE FROM mouvements_emplacement WHERE reception_id IN (?)', [r]);
    await supprimer('inventaire', 'DELETE FROM inventaire_scans WHERE reception_id IN (?)', [r]);
    await supprimer('affectations', 'DELETE FROM affectations_colis WHERE reception_id IN (?)', [r]);
    await supprimer('plans', 'DELETE FROM plans_rangement WHERE reception_id IN (?)', [r]);
    await supprimer('placements', 'DELETE FROM placements WHERE reception_id IN (?)', [r]);
    await supprimer('lignes', 'DELETE FROM receptions WHERE id IN (?)', [r]);
    await supprimer('imports', 'DELETE FROM imports WHERE id IN (?)', [i]);
    if (sources.length) await supprimer('italie', 'DELETE FROM italie_imports WHERE id IN (?)', [sources]);
    // Livraisons de l'Italie jamais synchronisées : effacées aussi (seul l'import gardé reste)
    await supprimer('italie_non_synchronisees', 'DELETE FROM italie_imports WHERE id NOT IN (SELECT source_id FROM imports WHERE source_id IS NOT NULL)');
    await c.commit();
    const [[stock]] = await c.query('SELECT COALESCE(SUM(quantite), 0) AS q FROM placements');
    console.log(`Sauvegarde : ${fichier}`);
    console.log(`Gardé : ${garde.numero_livraison ?? 'import n° ' + garde.id}`);
    console.log('Effacé :', JSON.stringify(n));
    console.log(`Stock restant : ${stock.q} produit(s)`);
  } catch (e) {
    await c.rollback().catch(() => {});
    console.error("Annulé, rien n'a changé :", e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
