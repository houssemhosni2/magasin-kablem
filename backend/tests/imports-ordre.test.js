// Les imports sont ajoutés au stock dans l'ordre d'arrivée (base de test).
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');
const viderBase = require('./vider-base');

let chef;
const auth = () => ({ Authorization: `Bearer ${chef}` });
// sans réception mobile : secours du chef avec motif (la réception mobile est testée dans reception-import.test.js)
const ajouter = (id) => request(app).post(`/api/imports/${id}/ajouter-au-stock`).set(auth()).send({ force: true, motif_force: 'Test ordre' });

beforeAll(async () => {
  await viderBase();
  const hash = await bcrypt.hash('test1234', 4);
  await db.query(`INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES (30, '4001', 'Chef', 'Mona', ?, 'chef_magasin')`, [hash]);
  // Trois livraisons arrivées à 2 jours d'intervalle (la 3e créée en premier dans l'application)
  await db.query(`INSERT INTO imports (id, statut, numero_livraison, date_envoi, date_creation) VALUES
    (21, 'en_attente', 'LIV-A', NOW() - INTERVAL 4 DAY, NOW()),
    (22, 'en_attente', 'LIV-B', NOW() - INTERVAL 2 DAY, NOW()),
    (20, 'en_attente', 'LIV-C', NOW(), NOW() - INTERVAL 5 DAY)`);
  await db.query(`INSERT INTO receptions (import_id, type, taille_bobine, reference, lot, quantite) VALUES
    (21, 'bobine', 'grande', 'F0411', '202613001', 1),
    (22, 'bobine', 'grande', 'F0411', '202613002', 1),
    (20, 'bobine', 'grande', 'F0411', '202613003', 1)`);
  chef = (await request(app).post('/api/auth/login').send({ matricule: '4001', motDePasse: 'test1234' })).body.token;
});

afterAll(async () => {
  await db.end();
});

test("la liste indique l'ordre et l'import qui bloque", async () => {
  const r = await request(app).get('/api/imports').set(auth());
  const par = Object.fromEntries(r.body.map((i) => [i.numero_livraison, i]));
  expect(par['LIV-A']).toMatchObject({ ordre_attente: 1, bloque_par: null });
  expect(par['LIV-B']).toMatchObject({ ordre_attente: 2, bloque_par: { id: 21, numero_livraison: 'LIV-A' } });
  expect(par['LIV-C']).toMatchObject({ ordre_attente: 3, bloque_par: { id: 21 } });
});

test('un import plus récent est verrouillé tant que le plus ancien est en attente', async () => {
  const r = await ajouter(22);
  expect(r.status).toBe(409);
  expect(r.body.message).toMatch(/LIV-A/);
  const plan = await request(app).get('/api/imports/22/plan-rangement').set(auth());
  expect(plan.status).toBe(409);
  const [[i]] = await db.query('SELECT statut FROM imports WHERE id = 22');
  expect(i.statut).toBe('en_attente');
});

test("l'ordre suit la date d'arrivée de l'Italie, pas la date de création", async () => {
  expect((await ajouter(20)).status).toBe(409); // créé en premier mais arrivé en dernier
});

test("le plus ancien d'abord, puis le suivant se déverrouille", async () => {
  expect((await ajouter(21)).status).toBe(200);
  expect((await ajouter(20)).status).toBe(409); // LIV-B est maintenant le plus ancien
  expect((await ajouter(22)).status).toBe(200);
  expect((await ajouter(20)).status).toBe(200);
});
