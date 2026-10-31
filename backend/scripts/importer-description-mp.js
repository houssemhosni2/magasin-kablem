// Importe le catalogue des articles depuis « DESCRIPTION MP.xlsx » (colonnes DESCRIPTION MP, ARTICLE MP).
// Ajoute les nouvelles références et met à jour la famille/catégorie des existantes ; ne supprime rien.
//   node scripts/importer-description-mp.js ["chemin/vers/fichier.xlsx"]
require('dotenv').config({ quiet: true });
const path = require('path');
const ExcelJS = require('exceljs');
const mysql = require('mysql2/promise');
const { familleDe, lireArticle } = require('../src/articles');

const FICHIER = process.argv[2] || path.join(__dirname, '..', '..', 'DESCRIPTION MP.xlsx');
const texte = (v) => String(v && typeof v === 'object' ? (v.result ?? v.text ?? v.richText?.map((x) => x.text).join('') ?? '') : (v ?? '')).trim();

(async () => {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.readFile(FICHIER);
  const feuille = classeur.worksheets[0];
  const articles = [];
  const refus = [];
  feuille.eachRow((ligne, n) => {
    if (n === 1) return; // en-tête
    const categorie = texte(ligne.getCell(1).value);
    const reference = texte(ligne.getCell(2).value);
    if (!categorie && !reference) return;
    const { article, erreur } = lireArticle({ reference, famille: familleDe(categorie), categorie });
    if (erreur) refus.push(`ligne ${n} : ${erreur}`);
    else articles.push(article);
  });

  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  try {
    await c.beginTransaction();
    const [[{ n: avant }]] = await c.query('SELECT COUNT(*) AS n FROM articles_mp');
    for (let i = 0; i < articles.length; i += 500) {
      const lot = articles.slice(i, i + 500);
      await c.query(
        `INSERT INTO articles_mp (reference, famille, categorie) VALUES ?
         ON DUPLICATE KEY UPDATE famille = VALUES(famille), categorie = VALUES(categorie)`,
        [lot.map((a) => [a.reference, a.famille, a.categorie])]
      );
    }
    const [[{ n: apres }]] = await c.query('SELECT COUNT(*) AS n FROM articles_mp');
    await c.commit();
    const [parFamille] = await c.query('SELECT famille, COUNT(*) AS n, COUNT(DISTINCT categorie) AS categories FROM articles_mp GROUP BY famille ORDER BY famille');
    console.log(`Fichier : ${FICHIER}`);
    console.log(`${articles.length} article(s) lus, ${refus.length} refusé(s), ${apres - avant} nouveau(x) dans la base`);
    for (const r of refus) console.log('  refusé', r);
    for (const f of parFamille) console.log(`  ${f.famille} : ${f.n} référence(s), ${f.categories} catégorie(s)`);
  } catch (e) {
    await c.rollback();
    console.error('Annulé, rien n\'a changé :', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
