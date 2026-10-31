// Réception des cosses palette par palette (10 cosses au maximum), sur la base de test.
// Même stratégie que les bobines : emplacement entièrement vide aux niveaux 1-2 d'abord,
// sinon cosse par cosse sur les palettes de cosses commencées, sinon la zone tampon.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');
const R = require('../src/rangement');
const viderBase = require('./vider-base');

let mag;
let chef;
const uuid = () => crypto.randomUUID();
const auth = (j = mag) => ({ Authorization: `Bearer ${j}` });
const IMP = 61;
const scan = (qr, paletteId) => request(app).post('/api/mobile/reception').set(auth()).send({ uuid: uuid(), import_id: IMP, palette_id: paletteId, qr });
const ouvrir = async () => (await request(app).post('/api/mobile/palettes').set(auth()).send({ import_id: IMP })).body;
const terminer = (id) => request(app).post(`/api/mobile/palettes/${id}/terminer`).set(auth()).send({});
const poser = (id, emplacement) => request(app).post(`/api/mobile/palettes/${id}/ranger`).set(auth()).send({ uuid: uuid(), emplacement });
const ranger = (qr, emplacement) => request(app).post('/api/mobile/rangement').set(auth()).send({ uuid: uuid(), emplacement, qr });
const vue = async (id) => (await request(app).get(`/api/mobile/receptions/${IMP}`).set(auth())).body.palettes.find((p) => p.id === id);
const colis = (ref, lot, n) => `${ref};13000;${n};${lot};1`;
const auStock = async (code) =>
  (await db.query('SELECT r.reference, SUM(p.quantite) AS q FROM placements p JOIN receptions r ON r.id = p.reception_id WHERE p.emplacement = ? GROUP BY r.reference ORDER BY r.reference', [code]))[0]
    .map((x) => `${x.reference}×${x.q}`);
const LOTS = { K0101: '202600020', K0102: '202600021', K0001: '202600022', B0001: '202600023', K0201: '202600024', K0301: '202600025' };
const c = (ref, n) => colis(ref, LOTS[ref], n);

beforeAll(async () => {
  await viderBase();
  await db.query("INSERT INTO parametres (cle, valeur) VALUES ('tampon_capacite', '2') ON DUPLICATE KEY UPDATE valeur = '2'");
  const hash = await bcrypt.hash('test1234', 4);
  await db.query(`INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES (72, '8101', 'Mag', 'Cosses', ?, 'magasinier'), (73, '8102', 'Chef', 'Cosses', ?, 'chef_magasin')`, [hash, hash]);
  // Stock existant : X = D100 porte 7 cosses K0001, Y = D201 porte 8 cosses K0002
  await db.query(`INSERT INTO imports (id, statut, numero_livraison, date_creation) VALUES (60, 'ajoute', 'LIV-60', NOW() - INTERVAL 9 DAY)`);
  await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES
    (600, 60, 'cosse', NULL, 'K0001', '202600010', 7), (601, 60, 'cosse', NULL, 'K0002', '202600011', 8)`);
  await db.query(`INSERT INTO placements (reception_id, emplacement, quantite) VALUES (600, 'D100', 7), (601, 'D201', 8)`);
  // Import en réception : des cosses de plusieurs références, et deux petites bobines
  await db.query(`INSERT INTO imports (id, statut, numero_livraison, date_envoi, date_creation) VALUES (${IMP}, 'en_attente', 'LIV-61', NOW(), NOW())`);
  await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES
    (611, ${IMP}, 'cosse', NULL, 'K0101', '${LOTS.K0101}', 6),
    (612, ${IMP}, 'cosse', NULL, 'K0102', '${LOTS.K0102}', 4),
    (613, ${IMP}, 'cosse', NULL, 'K0001', '${LOTS.K0001}', 4),
    (614, ${IMP}, 'bobine', 'petite', 'B0001', '${LOTS.B0001}', 2),
    (615, ${IMP}, 'cosse', NULL, 'K0201', '${LOTS.K0201}', 5),
    (616, ${IMP}, 'cosse', NULL, 'K0301', '${LOTS.K0301}', 20)`);
  const login = async (m) => (await request(app).post('/api/auth/login').send({ matricule: m, motDePasse: 'test1234' })).body.token;
  [mag, chef] = await Promise.all([login('8101'), login('8102')]);
});

afterAll(async () => {
  await db.query("DELETE FROM parametres WHERE cle = 'tampon_capacite'");
  await db.end();
});

let p1; // 6 K0101 + 4 K0102 : palette pleine
let p2; // 3 K0001, puis 1 oubliée
describe('palette de cosses ouverte : contrôles colis par colis', () => {
  test('une cosse de l’import sans palette : refusée', async () => {
    const r = await scan(c('K0101', 1));
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/cosses se reçoivent palette par palette/);
  });
  test('ticket sans n° de colis : refusé', async () => {
    const p = await ouvrir();
    const r = await scan(`K0101;${LOTS.K0101};6`, p.id);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/n° de colis.*cosse/);
  });
  test('10 cosses au maximum, références mélangées ; une 11e est refusée', async () => {
    p1 = await ouvrir(); // la palette vide déjà ouverte est reprise
    const qrs = [1, 2, 3, 4, 5, 6].map((n) => c('K0101', n)).concat([1, 2, 3, 4].map((n) => c('K0102', n)));
    for (const [k, qr] of qrs.entries()) {
      const r = await scan(qr, p1.id);
      expect(r.body).toMatchObject({ resultat: 'conforme', palette: { type: 'cosse', n: k + 1, capacite: 10, pleine: k === 9 } });
    }
    const r = await scan(c('K0201', 1), p1.id);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/pleine \(10 cosses plates\)/);
    expect(await vue(p1.id)).toMatchObject({ type: 'cosse', taille: null, capacite: 10, n: 10, pleine: true });
  });
  test('une bobine sur une palette de cosses : refusée', async () => {
    const r = await scan(c('B0001', 1), p1.id);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/contient des cosses : une palette ne mélange pas bobines et cosses/);
  });
  test('une cosse sur une palette de bobines : refusée ; la bobine retirée, la palette accepte les cosses', async () => {
    p2 = await ouvrir();
    expect((await scan(c('B0001', 1), p2.id)).body.palette).toMatchObject({ type: 'bobine', capacite: 6 });
    const r = await scan(c('K0001', 1), p2.id);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/contient des bobines/);
    const b = (await vue(p2.id)).bobines[0];
    expect((await request(app).delete(`/api/mobile/palettes/${p2.id}/bobines/${b.controle_id}`).set(auth())).body).toMatchObject({ n: 0, type: null });
    for (const n of [1, 2, 3]) expect((await scan(c('K0001', n), p2.id)).body.palette).toMatchObject({ type: 'cosse', n, capacite: 10 });
  });
});

describe('emplacement entièrement vide en priorité (niveaux 1 et 2)', () => {
  test('palette pleine : posée entière sur l’emplacement vide le plus proche de la porte', async () => {
    const t = (await terminer(p1.id)).body;
    expect(t).toMatchObject({ mode: 'entiere', emplacement: 'D200', tampon: false });
    expect(t.bobines.every((b) => b.emplacement === 'D200')).toBe(true);
    const r = await poser(p1.id, 'D200');
    expect(r.body.resultat).toBe('bon_emplacement');
    expect(r.body.message).toMatch(/10 cosses ajoutées au stock/);
    expect(await auStock('D200')).toEqual(['K0101×6', 'K0102×4']);
  });
  test('palette de 3 cosses : un emplacement vide près de sa référence, pas sur X (7/10)', async () => {
    const t = (await terminer(p2.id)).body;
    // K0001 est en D100 (X) : l'emplacement vide le plus proche est D101 (D200 et D201 sont occupés)
    expect(t).toMatchObject({ mode: 'entiere', emplacement: 'D101' });
    expect([1, 2]).toContain(R.lireCode(t.emplacement).niveau);
    expect((await poser(p2.id, 'D101')).body.resultat).toBe('bon_emplacement');
    expect(await auStock('D100')).toEqual(['K0001×7']); // X n'a pas bougé
  });
  test('cosse oubliée : la palette se rouvre et la cosse rejoint le même emplacement', async () => {
    expect((await request(app).post(`/api/mobile/palettes/${p2.id}/rouvrir`).set(auth())).body.statut).toBe('ouverte');
    expect((await scan(c('K0001', 4), p2.id)).body.resultat).toBe('conforme');
    expect((await terminer(p2.id)).body).toMatchObject({ mode: 'entiere', emplacement: 'D101' });
    expect((await poser(p2.id, 'D101')).body.resultat).toBe('bon_emplacement');
    expect(await auStock('D101')).toEqual(['K0001×4']);
  });
});

describe('plus d’emplacement vide aux niveaux 1 et 2 : cosse par cosse', () => {
  beforeAll(async () => {
    // Toutes les places des niveaux 1 et 2 pleines (10 cosses), sauf X = D100 (7/10) et Y = D201 (8/10)
    const [occupes] = await db.query('SELECT emplacement, SUM(quantite) AS q FROM placements GROUP BY emplacement');
    const dedans = new Map(occupes.map((o) => [o.emplacement, Number(o.q)]));
    const aRemplir = [...R.emplacementsParProximite(1), ...R.emplacementsParProximite(2)]
      .filter((code) => code !== 'D100' && code !== 'D201' && (dedans.get(code) ?? 0) < 10);
    const total = aRemplir.reduce((t, code) => t + 10 - (dedans.get(code) ?? 0), 0);
    await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES (699, 60, 'cosse', NULL, 'K9999', '202600099', ?)`, [total]);
    await db.query('INSERT INTO placements (reception_id, emplacement, quantite) VALUES ?', [aRemplir.map((code) => [699, code, 10 - (dedans.get(code) ?? 0)])]);
  });

  test('palette de 5 cosses : 3 sur X (7/10), puis 2 sur Y (8/10)', async () => {
    const p = await ouvrir();
    for (const n of [1, 2, 3, 4, 5]) await scan(c('K0201', n), p.id);
    const t = (await terminer(p.id)).body;
    expect(t.mode).toBe('divisee');
    expect(t.emplacement).toBe(null);
    expect(t.bobines.map((b) => [b.colis, b.emplacement])).toEqual([[1, 'D100'], [2, 'D100'], [3, 'D100'], [4, 'D201'], [5, 'D201']]);
    expect(t.bobines[0].motif).toMatch(/Palette de cosses commencée/);
    // Rangement cosse par cosse : seul l'emplacement donné est accepté
    expect((await ranger(c('K0201', 4), 'D100')).body.resultat).toBe('faux_emplacement');
    for (const [n, code] of [[1, 'D100'], [2, 'D100'], [3, 'D100'], [4, 'D201']]) {
      expect((await ranger(c('K0201', n), code)).body.resultat).toBe('bon_emplacement');
    }
    const dernier = await ranger(c('K0201', 5), 'D201');
    expect(dernier.body.message).toMatch(/palette \d+ rangée/);
    expect(await auStock('D100')).toEqual(['K0001×7', 'K0201×3']);
    expect(await auStock('D201')).toEqual(['K0002×8', 'K0201×2']);
    expect((await vue(p.id)).statut).toBe('rangee');
  });

  test('plus aucune place en rayon : palette entière sur une place vide de la zone tampon', async () => {
    const p = await ouvrir();
    for (const n of [1, 2]) await scan(c('K0301', n), p.id);
    const t = (await terminer(p.id)).body;
    expect(t).toMatchObject({ mode: 'entiere', emplacement: 'T01', tampon: true });
    expect(t.motif).toMatch(/aux niveaux 1 et 2/);
    expect((await poser(p.id, 'T01')).body.resultat).toBe('bon_emplacement');
  });

  test('pas de place tampon vide : cosse par cosse sur la palette de cosses commencée en zone tampon', async () => {
    await db.query("UPDATE parametres SET valeur = '1' WHERE cle = 'tampon_capacite'");
    const p = await ouvrir();
    for (const n of [3, 4, 5]) await scan(c('K0301', n), p.id);
    const t = (await terminer(p.id)).body;
    expect(t.mode).toBe('divisee');
    expect(t.bobines.map((b) => b.emplacement)).toEqual(['T01', 'T01', 'T01']);
  });

  test('plus aucune place, même en zone tampon : refus clair, rien n’est réservé', async () => {
    // T01 : 2 posées + 3 réservées = 5 ; une palette de 6 n'y tient pas en entier
    const p = await ouvrir();
    for (const n of [6, 7, 8, 9, 10, 11]) await scan(c('K0301', n), p.id);
    const r = await terminer(p.id);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/agrandir la zone tampon/);
    expect((await db.query('SELECT COUNT(*) AS n FROM affectations_colis WHERE palette_id = ?', [p.id]))[0][0].n).toBe(0);
    // Le chef agrandit la zone tampon : la palette entière va sur la nouvelle place vide
    await db.query("UPDATE parametres SET valeur = '2' WHERE cle = 'tampon_capacite'");
    expect((await terminer(p.id)).body).toMatchObject({ mode: 'entiere', emplacement: 'T02' });
  });
});

describe('web', () => {
  test('« Ajouter au stock » ne planifie pas une 2e fois les cosses déjà rangées par palette', async () => {
    const r = await request(app).get(`/api/imports/${IMP}/plan-rangement`).set(auth(chef));
    expect(r.status).toBe(200);
    const parLigne = new Map();
    for (const p of r.body) parLigne.set(p.id, (parLigne.get(p.id) ?? 0) + p.quantite);
    // K0101, K0102, K0001 et K0201 sont entièrement rangées ; K0301 : 2 posées en T01 sur 20
    expect([...parLigne.keys()].sort()).toEqual([614, 616]);
    expect(parLigne.get(616)).toBe(18);
  });
  test('le chef change l’emplacement d’une palette de cosses entière : toute la palette suit', async () => {
    const [[a]] = await db.query("SELECT a.id FROM affectations_colis a JOIN palettes_reception p ON p.id = a.palette_id WHERE p.emplacement = 'T02' AND a.range_le IS NULL LIMIT 1");
    const r = await request(app).put(`/api/imports/affectations/${a.id}`).set(auth(chef)).send({ emplacement: 'T03', motif: 'autre', commentaire: 'essai' });
    // T03 n'existe pas encore (zone tampon de 2 places)
    expect(r.status).toBe(400);
    await db.query("UPDATE parametres SET valeur = '3' WHERE cle = 'tampon_capacite'");
    const ok = await request(app).put(`/api/imports/affectations/${a.id}`).set(auth(chef)).send({ emplacement: 'T03', motif: 'autre', commentaire: 'essai' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ emplacement: 'T03', bobines: 6 });
    const [[h]] = await db.query("SELECT commentaire FROM mouvements_emplacement WHERE vers = 'T03' ORDER BY id DESC LIMIT 1");
    expect(h.commentaire).toMatch(/Palette \d+ \(6 cosses\)/);
  });
});
