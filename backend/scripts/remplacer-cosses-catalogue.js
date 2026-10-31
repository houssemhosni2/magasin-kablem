// Remplace les références de cosses du catalogue Articles par la liste fournie par le magasin
// (fichier « Copie de cosses », colonne Item). Les bobines et connecteurs ne bougent pas.
// Les anciennes références de cosses sont d'abord sauvegardées dans scripts/sauvegardes/.
//   node scripts/remplacer-cosses-catalogue.js
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { normaliserReference } = require('../src/articles');

// Une référence par ligne (certaines contiennent un espace : « AK 15304710 »)
const LISTE = `
F0253
F0301
F0344
F0493
F0706
F0735
F0736
H0608
H0612
H0620
H0635
H0636
H0638
M0092
W0714
W0827
W0910
W0911
W0912
W0913
W0917
W0918
AK 15304710
AK 15304723
AK 15304732
AK 15317766
AK 15396711
AK 15396712
F0063
F0232
F0307
F0315
F0317
F0319
F0330
F0356
F0391
F0395
F0410
F0411
F0413
F0427
F0429
F0433
F0435
F0436
F0439
F0444
F0448
F0452
F0464
F0465
F0470
F0472
F0473
F0477
F0482
F0490
F0491
F0492
F0494
F0496
F0497
F0503
F0511
F0512
F0516
F0519
F0520
F0534
F0542
F0543
F0551
F0553
F0558
F0565
F0567
F0570
F0576
F0577
F0580
F0581
F0582
F0583
F0584
F0593
F0594
F0595
F0600
F0608
F0610
F0618
F0620
F0624
F0625
F0626
F0627
F0629
F0632
F0635
F0637
F0641
F0646
F0647
F0650
F0651
F0652
F0654
F0700
F0702
F0709
F0714
F0715
F0717
F0719
F0720
F0721
F0723
F0729
F0732
F0734
F0738
F0739
F0740
F0741
F0742
F0742R
F0745
F0746
F0747
F0748
F0749
F0750
F0751
F0752
F0753
F0755
F0756
F0758
F0760
H0615
H0626
H0633
H0634
M0062
M0063
M0080
M0099
M0100
M0101
M0176
M0181
M0182
M0196
M0199
M0200
M0201
M0203
M0204
M0206
M0210
M0211
M0213
M0214
M0217
M0218
M0224
M0229
M0238
M0241
M0243
M0244
M0245
M0247
M0249
M0251
M0252
M0260
M0262
M0267
M0269
M0271
M0273
M0282
M0284
M0285
M0288
M0290
M0292
M0293
M0294
M0296
M0298
M0299
M0301
M0305
M0306
M0307
M0308
M0309
M0310
M0320
M0321
M0324
M0331
M0334
M0335
M0341
W0813
W0839
W0847
W0852
W0858
W0900
YA/7114-4100-08
YA/7114-4110-02
YA/7114-4112-02
YA/7114-4121-02
YA/7114-4721-02
YA/7114-6315-02
YA/7116-6316-02
YA/7116-6317-02
YAZ/7114-1475
YAZ/7114-4122-02`;

const REFERENCES = LISTE.split('\n').map(normaliserReference).filter(Boolean);
// Les 22 premières de la liste sont axiales, toutes les autres plates
const AXIALES = new Set(REFERENCES.slice(0, REFERENCES.indexOf('AK 15304710')));
const typeCosse = (r) => (AXIALES.has(r) ? 'axiale' : 'plat');

(async () => {
  const doublons = REFERENCES.filter((r, i, t) => t.indexOf(r) !== i);
  if (doublons.length) throw new Error('Référence en double dans la liste : ' + doublons.join(', '));

  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  try {
    const [anciennes] = await c.query("SELECT reference, famille, categorie FROM articles_mp WHERE famille = 'cosse' ORDER BY reference");
    const [autres] = await c.query("SELECT reference, famille FROM articles_mp WHERE famille <> 'cosse' AND reference IN (?)", [REFERENCES]);
    const dossier = path.join(__dirname, 'sauvegardes');
    fs.mkdirSync(dossier, { recursive: true });
    // heure dans le nom : une 2e exécution n'écrase pas la sauvegarde précédente
    const sauvegarde = path.join(dossier, `articles-cosses-avant-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
    fs.writeFileSync(sauvegarde, JSON.stringify(anciennes, null, 1));

    await c.beginTransaction();
    const [effacees] = await c.query("DELETE FROM articles_mp WHERE famille = 'cosse'");
    // une référence déjà connue comme bobine ou connecteur devient cosse
    await c.query(
      `INSERT INTO articles_mp (reference, famille, categorie, bobines_par_palette, type_cosse) VALUES ?
       ON DUPLICATE KEY UPDATE famille = VALUES(famille), categorie = VALUES(categorie), bobines_par_palette = NULL, type_cosse = VALUES(type_cosse)`,
      [REFERENCES.map((r) => [r, 'cosse', 'COSSE', null, typeCosse(r)])]
    );
    await c.commit();
    console.log(`Sauvegarde des ${anciennes.length} anciennes cosses : ${sauvegarde}`);
    console.log(`${effacees.affectedRows} cosse(s) effacée(s), ${REFERENCES.length} entrée(s) : ${AXIALES.size} axiale(s), ${REFERENCES.length - AXIALES.size} plate(s).`);
    for (const a of autres) console.log(`  ${a.reference} était « ${a.famille} » : devient cosse`);
  } catch (e) {
    await c.rollback().catch(() => {});
    console.error("Annulé, rien n'a changé :", e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
