// Vide les données de la base de test (le compte admin est gardé) : chaque fichier de test part de zéro
const db = require('../src/db');

const TABLES = [
  'articles_changements_taille', 'articles_mp', 'inventaire_scans', 'controles_mobile', 'preparation_lignes', 'preparations_export', 'export_details', 'exports',
  'mouvements_emplacement', 'affectations_colis', 'palettes_reception', 'plans_rangement', 'placements', 'reclamations', 'receptions', 'imports',
];

module.exports = async function viderBase() {
  for (const t of TABLES) await db.query(`DELETE FROM ${t}`);
  await db.query('DELETE FROM utilisateurs WHERE id <> 1');
};
