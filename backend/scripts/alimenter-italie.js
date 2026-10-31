// Démo de la synchronisation : ajoute de nouvelles livraisons dans la base de l'Italie
// (tables italie_imports / italie_produits). Ensuite, « Synchroniser » (page Import) les récupère.
// Chaque lancement crée des livraisons NOUVELLES (numéros et lots suivants) : on peut le relancer autant de fois qu'on veut.
// Usage : node scripts/alimenter-italie.js [nombre de livraisons, 2 par défaut]
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mysql = require('mysql2/promise');

// Modèles de livraisons, utilisés à tour de rôle
const MODELES = [
  {
    commentaire: 'Bobines et cosses',
    produits: [
      { type: 'bobine', taille: 'grande', reference: 'F0411', quantite: 3 },
      { type: 'bobine', taille: 'petite', reference: 'F0127', quantite: 6 },
      { type: 'bobine', taille: 'moyenne', reference: 'F0352', quantite: 4 },
      { type: 'cosse', reference: 'C2810', quantite: 12 },
      { type: 'cosse', reference: 'C6320', quantite: 5 },
    ],
  },
  {
    commentaire: 'Connecteurs TE et Lumberg',
    produits: [
      { type: 'connecteur', reference: 'K0207', quantite: 3, carton: [40, 30, 15, 2] },
      { type: 'connecteur', reference: 'K0412', quantite: 2, carton: [50, 35, 25, 3.5] },
      { type: 'connecteur', reference: 'K1208', quantite: 1, carton: [80, 60, 50, 9] },
      { type: 'cosse', reference: 'C1514', quantite: 6 },
    ],
  },
  {
    commentaire: 'Livraison mixte',
    produits: [
      { type: 'bobine', taille: 'moyenne', reference: 'F0518', quantite: 2 },
      { type: 'bobine', taille: 'petite', reference: 'F0129', quantite: 6 },
      { type: 'bobine', taille: 'grande', reference: 'F0415', quantite: 1 },
      { type: 'cosse', reference: 'C2810', quantite: 8 },
      { type: 'connecteur', reference: 'K0412', quantite: 2, carton: [40, 30, 20, 2.5] },
    ],
  },
];

(async () => {
  const nombre = Math.max(1, Math.min(10, parseInt(process.argv[2], 10) || 2));
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'magasin_kablem',
  });
  try {
    await c.beginTransaction();
    const annee = new Date().getFullYear();

    // Numéro de livraison suivant : LIV-2026-0104, 0105…
    const [[{ dernier }]] = await c.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) AS dernier
         FROM italie_imports WHERE numero LIKE ?`,
      [`LIV-${annee}-%`]
    );
    let numero = Number(dernier) || 0;

    // Lot suivant : plus grand que tous les lots déjà connus (9 chiffres), donc toujours croissant
    const [[{ lotMax }]] = await c.query(
      `SELECT MAX(l) AS lotMax FROM (
         SELECT CAST(lot AS UNSIGNED) AS l FROM receptions WHERE lot REGEXP '^[0-9]{9}$'
         UNION ALL
         SELECT CAST(lot AS UNSIGNED) FROM italie_produits WHERE lot REGEXP '^[0-9]{9}$'
       ) t`
    );
    let lot = Number(lotMax) || 202613000;

    // On tourne sur les modèles à partir du nombre de livraisons déjà envoyées
    const [[{ deja }]] = await c.query('SELECT COUNT(*) AS deja FROM italie_imports');

    for (let i = 0; i < nombre; i++) {
      const modele = MODELES[(Number(deja) + i) % MODELES.length];
      numero += 1;
      const code = `LIV-${annee}-${String(numero).padStart(4, '0')}`;
      const [r] = await c.query(
        'INSERT INTO italie_imports (numero, date_envoi, commentaire) VALUES (?, NOW() - INTERVAL ? SECOND, ?)',
        [code, nombre - 1 - i, modele.commentaire]
      );
      let total = 0;
      for (const p of modele.produits) {
        lot += 1;
        const [L, l, h, poids] = p.carton || [null, null, null, null];
        await c.query(
          `INSERT INTO italie_produits
             (italie_import_id, type, taille_bobine, reference, lot, quantite, longueur, largeur, hauteur, poids)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [r.insertId, p.type, p.taille || null, p.reference, String(lot), p.quantite, L, l, h, poids]
        );
        total += p.quantite;
      }
      console.log(`  + ${code}  ${modele.commentaire.padEnd(28)} ${modele.produits.length} lignes, ${total} produits`);
    }
    await c.commit();

    const [[{ disponibles }]] = await c.query(
      'SELECT COUNT(*) AS disponibles FROM italie_imports WHERE id NOT IN (SELECT source_id FROM imports WHERE source_id IS NOT NULL)'
    );
    console.log(`\n  ${disponibles} livraison(s) en attente de synchronisation.`);
    console.log('  Ouvrez la page Import puis cliquez sur « Synchroniser » (actualisez la page pour voir le badge).');
  } catch (err) {
    await c.rollback();
    console.error('  ERREUR :', err.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})().catch((e) => { console.error("  ERREUR :", e.message); process.exitCode = 1; });
