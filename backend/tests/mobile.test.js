// Contrôles du mobile, sur la base de test (voir tests/base-de-test.js).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');
const viderBase = require('./vider-base');

const uuid = () => crypto.randomUUID();
let jetonAli; // magasinier 1
let jetonSami; // magasinier 2
let jetonChef;

async function connexion(matricule) {
  const r = await request(app).post('/api/auth/login').send({ matricule, motDePasse: 'test1234' });
  return r.body.token;
}
const reception = (jeton, qr, id = uuid()) =>
  request(app).post('/api/mobile/reception').set('Authorization', `Bearer ${jeton}`).send({ uuid: id, qr });
const rangement = (jeton, emplacement, qr, id = uuid()) =>
  request(app).post('/api/mobile/rangement').set('Authorization', `Bearer ${jeton}`).send({ uuid: id, emplacement, qr });
const suggestion = (jeton, qr) =>
  request(app).post('/api/mobile/rangement/suggestion').set('Authorization', `Bearer ${jeton}`).send({ qr });
const placements = async () => (await db.query('SELECT reception_id, emplacement, quantite FROM placements ORDER BY id'))[0];

beforeAll(async () => {
  await viderBase();
  const hash = await bcrypt.hash('test1234', 4);
  await db.query(
    `INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES
       (10, '1001', 'Ben Ali', 'Ali', ?, 'magasinier'),
       (11, '1002', 'Trabelsi', 'Sami', ?, 'magasinier'),
       (12, '2001', 'Chef', 'Mona', ?, 'chef_magasin')`,
    [hash, hash, hash]
  );
  // Import 1 : réception validée, plan de rangement F0411 → D000, C2810 → D100, F0352 → D001 (rien encore au stock).
  // Import 2 : en attente.
  await db.query(`INSERT INTO imports (id, statut, date_creation, date_ajout_stock) VALUES
                    (1, 'ajoute', NOW() - INTERVAL 1 DAY, NOW()), (2, 'en_attente', NOW(), NULL)`);
  await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES
                    (1, 1, 'bobine', 'grande', 'F0411', '202613001', 1),
                    (2, 1, 'cosse', NULL, 'C2810', '202613002', 6),
                    (3, 2, 'bobine', 'petite', 'F0127', '202613003', 6),
                    (4, 1, 'bobine', 'moyenne', 'F0352', '202613004', 2)`);
  await db.query(`INSERT INTO plans_rangement (reception_id, emplacement, quantite) VALUES (1, 'D000', 1), (2, 'D100', 6), (4, 'D001', 2)`);
  [jetonAli, jetonSami, jetonChef] = await Promise.all([connexion('1001'), connexion('1002'), connexion('2001')]);
});

afterAll(async () => {
  await db.end();
});

describe('contrôle 1 : réception du ticket', () => {
  let premier;

  test('ticket conforme : vert + emplacement prévu', async () => {
    premier = { id: uuid() };
    const r = await reception(jetonAli, 'F0411;202613001;1', premier.id);
    expect(r.status).toBe(200);
    expect(r.body.resultat).toBe('conforme');
    expect(r.body.couleur).toBe('vert');
    expect(r.body.emplacements_prevus).toEqual([{ code: 'D000', quantite: 1, ranges: 0 }]);
    premier.reponse = r.body;
  });

  test('doublon (même uuid renvoyé après coupure) : même réponse, rien de compté en plus', async () => {
    const [[{ n: avant }]] = await db.query('SELECT COUNT(*) AS n FROM controles_mobile');
    const r = await reception(jetonAli, 'F0411;202613001;1', premier.id);
    expect(r.body.resultat).toBe('conforme');
    expect(r.body.rejoue).toBe(true);
    const [[{ n: apres }]] = await db.query('SELECT COUNT(*) AS n FROM controles_mobile');
    expect(apres).toBe(avant);
  });

  test('ticket déjà traité : refusé', async () => {
    const r = await reception(jetonSami, 'F0411;202613001;1');
    expect(r.body.resultat).toBe('deja_traite');
    expect(r.body.couleur).toBe('rouge');
  });

  test('écart de quantité : orange, écart enregistré', async () => {
    const r = await reception(jetonAli, 'C2810;202613002;5');
    expect(r.body.resultat).toBe('ecart_quantite');
    expect(r.body.couleur).toBe('orange');
    expect(r.body.ecart).toBe(-1);
    const [[ligne]] = await db.query("SELECT ecart, utilisateur_id FROM controles_mobile WHERE resultat = 'ecart_quantite'");
    expect(ligne).toEqual({ ecart: -1, utilisateur_id: 10 });
  });

  test('référence ou lot inconnu : rouge, rangement bloqué', async () => {
    const r = await reception(jetonAli, 'X9999;111111111;1');
    expect(r.body.resultat).toBe('inconnu');
    expect(r.body.couleur).toBe('rouge');
  });

  test('ticket illisible', async () => {
    const r = await reception(jetonAli, 'bonjour');
    expect(r.body.resultat).toBe('ticket_illisible');
  });

  test('uuid manquant : refusé', async () => {
    const r = await request(app).post('/api/mobile/reception').set('Authorization', `Bearer ${jetonAli}`).send({ qr: 'F0411;1;1' });
    expect(r.status).toBe(400);
  });

  test('deux opérateurs scannent le même ticket en même temps : un seul est reçu', async () => {
    const [a, b] = await Promise.all([
      reception(jetonAli, 'F0127;202613003;6'),
      reception(jetonSami, 'F0127;202613003;6'),
    ]);
    const resultats = [a.body.resultat, b.body.resultat].sort();
    expect(resultats).toEqual(['conforme', 'deja_traite']);
    // Import en attente : l'emplacement prévu est celui du plan de l'application
    const conforme = a.body.resultat === 'conforme' ? a.body : b.body;
    expect(conforme.emplacements_prevus.length).toBeGreaterThan(0);
  });
});

describe('contrôle 2 : rangement', () => {
  test("produit pas encore passé en réception : refusé", async () => {
    const r = await rangement(jetonAli, 'D001', 'F0352;202613004;2');
    expect(r.body.resultat).toBe('non_recu');
  });

  test('faux emplacement : rouge, rien dans le stock, tentative journalisée', async () => {
    const avant = await placements();
    const r = await rangement(jetonAli, 'EMPL:D101', 'C2810;202613002;5');
    expect(r.body.resultat).toBe('faux_emplacement');
    expect(r.body.couleur).toBe('rouge');
    expect(r.body.emplacements_prevus).toEqual([{ code: 'D100', quantite: 6, ranges: 0 }]);
    expect(await placements()).toEqual(avant);
    const j = await request(app).get('/api/mobile/journal').set('Authorization', `Bearer ${jetonChef}`);
    const tentative = j.body.find((l) => l.resultat === 'faux_emplacement');
    expect(tentative).toMatchObject({ reference: 'C2810', lot: '202613002', emplacement_scanne: 'D101', emplacement_prevu: 'D100', matricule: '1001' });
  });

  test('bon emplacement : vert, et le produit entre au stock à ce moment-là', async () => {
    expect((await placements()).filter((p) => p.reception_id === 1)).toEqual([]); // reçu, pas encore au stock
    const r = await rangement(jetonAli, 'D000', 'F0411;202613001;1');
    expect(r.body.resultat).toBe('bon_emplacement');
    expect(r.body.couleur).toBe('vert');
    expect(r.body.message).toMatch(/ajouté au stock/);
    expect((await placements()).filter((p) => p.reception_id === 1)).toEqual([{ reception_id: 1, emplacement: 'D000', quantite: 1 }]);
  });

  test('déjà rangé : pas de double rangement', async () => {
    const r = await rangement(jetonSami, 'D000', 'F0411;202613001;1');
    expect(r.body.resultat).toBe('deja_traite');
  });

  test("import pas encore ajouté au stock (web) : orange, rien d'enregistré", async () => {
    const reponse = await reception(jetonAli, 'F0127;202613003;6');
    expect(reponse.body.resultat).toBe('deja_traite'); // reçu dans le test précédent
    const [[c]] = await db.query("SELECT emplacement_prevu FROM controles_mobile WHERE resultat = 'conforme' AND reference = 'F0127'");
    const prevu = c.emplacement_prevu.split(', ')[0];
    const r = await rangement(jetonAli, prevu, 'F0127;202613003;6');
    expect(r.body.resultat).toBe('import_en_attente');
  });

  test('emplacement inconnu', async () => {
    const r = await rangement(jetonAli, 'Z999', 'F0411;202613001;1');
    expect(r.body.resultat).toBe('emplacement_inconnu');
  });

  test('deux opérateurs rangent le même produit en même temps : un seul est compté', async () => {
    await reception(jetonAli, 'F0352;202613004;2');
    const [a, b] = await Promise.all([
      rangement(jetonAli, 'D001', 'F0352;202613004;2'),
      rangement(jetonSami, 'D001', 'F0352;202613004;2'),
    ]);
    expect([a.body.resultat, b.body.resultat].sort()).toEqual(['bon_emplacement', 'deja_traite']);
  });
});

describe('consultation et droits', () => {
  test("consulter un emplacement", async () => {
    // C2810 a une place réservée en D100 mais n'est pas rangé : rien au stock en D100
    const r = await request(app).get('/api/mobile/emplacement/D100').set('Authorization', `Bearer ${jetonAli}`);
    expect(r.body.produits).toEqual([]);
    const d000 = await request(app).get('/api/mobile/emplacement/D000').set('Authorization', `Bearer ${jetonAli}`);
    expect(d000.body.produits).toEqual([expect.objectContaining({ reference: 'F0411', quantite: 1 })]);
    // la fausse tentative a été faite en D101 : elle apparaît dans l'historique de D101
    const d101 = await request(app).get('/api/mobile/emplacement/D101').set('Authorization', `Bearer ${jetonAli}`);
    expect(d101.body.produits).toEqual([]);
    expect(d101.body.controles[0]).toMatchObject({ resultat: 'faux_emplacement', reference: 'C2810' });
  });

  test('consulter un produit : statut de la ligne', async () => {
    const r = await request(app).get('/api/mobile/produit?reference=F0411').set('Authorization', `Bearer ${jetonAli}`);
    expect(r.body[0]).toMatchObject({ statut: 'rangee', emplacements: [{ code: 'D000', quantite: 1 }] });
    const e = await request(app).get('/api/mobile/produit?reference=C2810').set('Authorization', `Bearer ${jetonAli}`);
    expect(e.body[0].statut).toBe('en_ecart');
  });

  test('le journal est réservé au responsable', async () => {
    const r = await request(app).get('/api/mobile/journal').set('Authorization', `Bearer ${jetonAli}`);
    expect(r.status).toBe(403);
  });

  test('sans connexion : refusé', async () => {
    const r = await request(app).post('/api/mobile/reception').send({ uuid: uuid(), qr: 'F0411;202613001;1' });
    expect(r.status).toBe(401);
  });
});

describe('tickets fournisseur : un ticket = un colis', () => {
  // Ligne d'import : 2 colis de F0391 lot 202613167, place réservée en D002
  beforeAll(async () => {
    await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES (5, 1, 'bobine', 'grande', 'F0391', '202613167', 2)`);
    await db.query(`INSERT INTO plans_rangement (reception_id, emplacement, quantite) VALUES (5, 'D002', 2)`);
  });
  const colis = (n) => `F0391;13000;${n};202613167;1`;

  test('QR « Codice Articolo » scanné par erreur : illisible avec la bonne consigne', async () => {
    const r = await reception(jetonAli, 'F0391');
    expect(r.body.resultat).toBe('ticket_illisible');
    expect(r.body.message).toMatch(/QR du bas/);
  });

  test('1er colis : conforme, 1/2', async () => {
    const r = await reception(jetonAli, colis(10));
    expect(r.body).toMatchObject({ resultat: 'conforme', colis: { numero: 10, recus: 1, attendus: 2 } });
    expect(r.body.emplacements_prevus).toEqual([{ code: 'D002', quantite: 2, ranges: 0 }]);
  });

  test('même colis rescanné : déjà reçu', async () => {
    const r = await reception(jetonSami, colis(10));
    expect(r.body.resultat).toBe('deja_traite');
  });

  test('2e colis : conforme, 2/2', async () => {
    const r = await reception(jetonAli, colis(11));
    expect(r.body).toMatchObject({ resultat: 'conforme', colis: { recus: 2, attendus: 2 } });
  });

  test('3e colis : en trop, écart enregistré', async () => {
    const r = await reception(jetonAli, colis(12));
    expect(r.body.resultat).toBe('ecart_quantite');
    expect(r.body.ecart).toBe(1);
  });

  test('rangement, 1re étape : le ticket scanné indique où aller, sans rien enregistrer', async () => {
    const avant = (await db.query('SELECT COUNT(*) AS n FROM controles_mobile'))[0][0].n;
    expect((await suggestion(jetonAli, colis(40))).body.resultat).toBe('non_recu');
    expect((await suggestion(jetonAli, 'F0391')).body.resultat).toBe('ticket_illisible');
    const r = await suggestion(jetonAli, colis(10));
    expect(r.body).toMatchObject({ resultat: 'a_ranger', couleur: 'vert', suggestion: { code: 'D002', quantite: 2, ranges: 0, niveau: 0 } });
    expect(r.body.message).toMatch(/allez en D002/);
    expect((await db.query('SELECT COUNT(*) AS n FROM controles_mobile'))[0][0].n).toBe(avant);
  });

  test('rangement : colis non reçu refusé, colis reçu au bon emplacement accepté, une seule fois', async () => {
    expect((await rangement(jetonAli, 'D002', colis(40))).body.resultat).toBe('non_recu');
    expect((await rangement(jetonAli, 'D003', colis(10))).body.resultat).toBe('faux_emplacement');
    expect((await rangement(jetonAli, 'D002', colis(10))).body.resultat).toBe('bon_emplacement');
    expect((await rangement(jetonAli, 'D002', colis(10))).body.resultat).toBe('deja_traite');
    expect((await rangement(jetonAli, 'D002', colis(11))).body.resultat).toBe('bon_emplacement');
  });

  test('suggestion pour un colis déjà rangé : refusée, avec son emplacement', async () => {
    const r = await suggestion(jetonAli, colis(10));
    expect(r.body.resultat).toBe('deja_traite');
    expect(r.body.message).toMatch(/déjà rangé en D002/);
  });

  test('colis par colis : chaque bobine rangée entre au stock, une place pleine est refusée', async () => {
    // 3 petites bobines, plan D010 ×2 et D011 ×1
    await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES (6, 1, 'bobine', 'petite', 'CFLR9YAT30035800002T', '202614133', 3)`);
    await db.query(`INSERT INTO plans_rangement (reception_id, emplacement, quantite) VALUES (6, 'D010', 2), (6, 'D011', 1)`);
    const petit = (n) => `CFLR9YAT30035800002T;17000;${n};202614133;3`;
    const auStock = async () => (await placements()).filter((p) => p.reception_id === 6).map((p) => [p.emplacement, p.quantite]);
    for (const n of [1, 2, 3]) expect((await reception(jetonAli, petit(n))).body.resultat).toBe('conforme');
    expect(await auStock()).toEqual([]); // reçus, rien au stock
    const etapes = [[1, 'D010', [['D010', 1]], '1/3'], [2, 'D010', [['D010', 2]], '2/3']];
    for (const [n, attendu, stock, compte] of etapes) {
      expect((await suggestion(jetonAli, petit(n))).body.suggestion.code).toBe(attendu);
      const r = await rangement(jetonAli, attendu, petit(n));
      expect(r.body).toMatchObject({ resultat: 'bon_emplacement', titre: 'Ajouté au stock' });
      expect(r.body.message).toContain(`ajouté au stock (${compte} au stock)`);
      expect(await auStock()).toEqual(stock);
    }
    // Le colis n° 3 est attribué à D011 : refusé en D010
    const plein = await rangement(jetonAli, 'D010', petit(3));
    expect(plein.body.resultat).toBe('faux_emplacement');
    expect(plein.body.message).toMatch(/colis n° 3 va en D011, pas en D010/);
    expect(await auStock()).toEqual([['D010', 2]]);
    expect((await suggestion(jetonAli, petit(3))).body.suggestion.code).toBe('D011');
    expect((await rangement(jetonAli, 'D011', petit(3))).body.message).toContain('(3/3 au stock)');
    expect(await auStock()).toEqual([['D010', 2], ['D011', 1]]);
    // tout est rangé : la suggestion refuse un double rangement
    expect((await suggestion(jetonAli, petit(3))).body.resultat).toBe('deja_traite');
  });

  test('emplacement imposé : une autre place prévue du même lot, même libre, est refusée', async () => {
    // 3 petites bobines, plan D020 ×2 puis D021 ×1 : colis n° 7 et 8 → D020, n° 9 → D021
    await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES (7, 1, 'bobine', 'petite', 'F0700', '202614700', 3)`);
    await db.query(`INSERT INTO plans_rangement (reception_id, emplacement, quantite) VALUES (7, 'D020', 2), (7, 'D021', 1)`);
    const t = (n) => `F0700;5000;${n};202614700;1`;
    for (const n of [9, 8, 7]) expect((await reception(jetonAli, t(n))).body.resultat).toBe('conforme');
    // Plan posé sans validation (comme un import validé avant cette règle) : attribution au 1er scan du ticket
    const s9 = await suggestion(jetonAli, t(9));
    expect(s9.body.suggestion.code).toBe('D020');
    // une fois attribué, le même ticket redonne le même emplacement
    expect((await suggestion(jetonAli, t(9))).body.suggestion.code).toBe('D020');
    expect((await suggestion(jetonAli, t(7))).body.suggestion.code).toBe('D020');
    expect((await suggestion(jetonAli, t(8))).body.suggestion.code).toBe('D021');
    // D021 a de la place, mais ce n'est pas l'emplacement du colis n° 9
    const faux = await rangement(jetonAli, 'D021', t(9));
    expect(faux.body).toMatchObject({ resultat: 'faux_emplacement', emplacement_scanne: 'D021', emplacements_prevus: [{ code: 'D020', quantite: 1 }] });
    expect(faux.body.message).toMatch(/Appelez le chef/);
    expect((await placements()).filter((p) => p.reception_id === 7)).toEqual([]);
    expect((await rangement(jetonAli, 'D020', t(9))).body.resultat).toBe('bon_emplacement');
  });

  test('stock (web) : seuls les produits rangés y figurent', async () => {
    const r = await request(app).get('/api/stock').set('Authorization', `Bearer ${jetonChef}`);
    const refs = r.body.map((l) => l.reference);
    expect(refs).toContain('CFLR9YAT30035800002T');
    expect(refs).not.toContain('C2810'); // place réservée, jamais rangé
  });

  test('consulter un emplacement : numéros des colis présents', async () => {
    const r = await request(app).get('/api/mobile/emplacement/D002').set('Authorization', `Bearer ${jetonAli}`);
    expect(r.body.produits.find((p) => p.reference === 'F0391')).toMatchObject({ quantite: 2, colis: [10, 11] });
  });

  test('consulter : 2 colis reçus et rangés', async () => {
    const r = await request(app).get('/api/mobile/produit?reference=F0391').set('Authorization', `Bearer ${jetonAli}`);
    expect(r.body[0]).toMatchObject({ nb_recus: 3, nb_ranges: 2, statut: 'rangee' });
  });
});
