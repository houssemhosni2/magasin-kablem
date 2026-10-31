// Inventaire initial (étude n° 2) : chef de magasin et administrateur, sur la base de test.
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');
const viderBase = require('./vider-base');

let chef;
let mag;
const auth = (j) => ({ Authorization: `Bearer ${j}` });
const voir = (code, j = chef) => request(app).get(`/api/mobile/inventaire/emplacements/${code}`).set(auth(j));
const valider = (code, qrs, j = chef) => request(app).post(`/api/mobile/inventaire/emplacements/${code}`).set(auth(j)).send({ qrs });
const contenu = async (code) =>
  (await db.query('SELECT r.reference, p.quantite FROM placements p JOIN receptions r ON r.id = p.reception_id WHERE p.emplacement = ? ORDER BY r.reference', [code]))[0]
    .map((x) => `${x.reference}×${x.quantite}`);
const petite = (ref, lot, n) => `${ref};17000;${n};${lot};1`;

beforeAll(async () => {
  await viderBase();
  const hash = await bcrypt.hash('test1234', 4);
  await db.query(`INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES
    (90, '9101', 'Chef', 'Inv', ?, 'chef_magasin'), (91, '9102', 'Mag', 'Inv', ?, 'magasinier')`, [hash, hash]);
  await db.query(`INSERT INTO articles_mp (reference, famille, categorie) VALUES
    ('CFLR9YAT30035800002T', 'bobine', 'BOBINE'), ('W0714', 'cosse', 'COSSE')`);
  // Données d'essai : l'application croit qu'il y a 3 grandes bobines G0001 en D003
  await db.query(`INSERT INTO imports (id, statut, numero_livraison, date_creation) VALUES (70, 'ajoute', 'LIV-70', NOW() - INTERVAL 30 DAY)`);
  await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES (701, 70, 'bobine', 'grande', 'G0001', '202600001', 3)`);
  await db.query(`INSERT INTO placements (reception_id, emplacement, quantite) VALUES (701, 'D003', 3)`);
  const login = async (m) => (await request(app).post('/api/auth/login').send({ matricule: m, motDePasse: 'test1234' })).body.token;
  [chef, mag] = await Promise.all([login('9101'), login('9102')]);
});

afterAll(async () => {
  await db.end();
});

test('réservé au chef de magasin et à l’administrateur', async () => {
  expect((await voir('D003', mag)).status).toBe(403);
  expect((await valider('D003', [], mag)).status).toBe(403);
});

test("l'emplacement montre ce que l'application croit y trouver", async () => {
  const r = await voir('D003');
  expect(r.body).toMatchObject({ code: 'D003', niveau: 0, contenu: [{ reference: 'G0001', quantite: 3 }], inventorie_le: null });
});

test('contrôles : catalogue, colis en double, bon niveau', async () => {
  const inconnu = await valider('D003', ['X9999;1;1;111;1']);
  expect(inconnu.status).toBe(400);
  expect(inconnu.body.message).toMatch(/X9999/);
  const double = await valider('D003', [petite('CFLR9YAT30035800002T', '202614133', 1), petite('CFLR9YAT30035800002T', '202614133', 1)]);
  expect(double.status).toBe(409);
  const niveau = await valider('D003', ['W0714;500;1;202600009;1']);
  expect(niveau.status).toBe(409);
  expect(niveau.body.message).toMatch(/niveaux 1 et 2/);
  expect(await contenu('D003')).toEqual(['G0001×3']); // rien n'a changé
});

test('validation : le contenu scanné remplace celui de l’application, écarts et historique', async () => {
  const qrs = [1, 2, 3, 4].map((n) => petite('CFLR9YAT30035800002T', '202614133', n));
  const r = await valider('D003', qrs);
  expect(r.body).toMatchObject({ code: 'D003', total: 4 });
  expect(r.body.ecarts).toEqual(expect.arrayContaining([
    { reference: 'G0001', lot: '202600001', application: 3, compte: 0 },
    { reference: 'CFLR9YAT30035800002T', lot: '202614133', application: 0, compte: 4 },
  ]));
  expect(await contenu('D003')).toEqual(['CFLR9YAT30035800002T×4']);
  // rattaché à l'import « Inventaire » du jour, bobine = petite bobine
  const [[l]] = await db.query("SELECT r.type, r.taille_bobine, r.quantite, i.numero_livraison, i.statut FROM receptions r JOIN imports i ON i.id = r.import_id WHERE r.reference = 'CFLR9YAT30035800002T'");
  expect(l).toMatchObject({ type: 'bobine', taille_bobine: 'petite', quantite: 4, statut: 'ajoute' });
  expect(l.numero_livraison).toMatch(/^INVENTAIRE-\d{4}-\d{2}-\d{2}$/);
  const [h] = await db.query("SELECT reference, depuis, vers, quantite FROM mouvements_emplacement WHERE origine = 'inventaire' ORDER BY id");
  expect(h).toEqual([
    { reference: 'G0001', depuis: 'D003', vers: null, quantite: 3 },
    { reference: 'CFLR9YAT30035800002T', depuis: null, vers: 'D003', quantite: 4 },
  ]);
});

test('un colis déjà inventorié ailleurs est refusé ; recompter un emplacement le remplace', async () => {
  const ailleurs = await valider('D004', [petite('CFLR9YAT30035800002T', '202614133', 2)]);
  expect(ailleurs.status).toBe(409);
  expect(ailleurs.body.message).toMatch(/déjà inventorié en D003/);
  // Recomptage de D003 : en fait 3 bobines seulement
  const r = await valider('D003', [1, 2, 3].map((n) => petite('CFLR9YAT30035800002T', '202614133', n)));
  expect(r.body.total).toBe(3);
  expect(await contenu('D003')).toEqual(['CFLR9YAT30035800002T×3']);
  const [[l]] = await db.query("SELECT quantite FROM receptions WHERE reference = 'CFLR9YAT30035800002T'");
  expect(l.quantite).toBe(3);
  // la bobine n° 4, retirée de D003, peut maintenant être inventoriée ailleurs
  expect((await valider('D004', [petite('CFLR9YAT30035800002T', '202614133', 4)])).body.total).toBe(1);
  expect((await voir('D003')).body.inventorie_le).not.toBeNull();
});

test('emplacement vide : on valide sans ticket', async () => {
  expect((await valider('D004', [])).body).toMatchObject({ total: 0 });
  expect(await contenu('D004')).toEqual([]);
});
