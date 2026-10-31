// Règles de placement d'une palette de réception (étude n° 2, version 1.2), sur la base de test.
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
const auth = () => ({ Authorization: `Bearer ${mag}` });
const IMP = 51;
const scan = (qr, paletteId) => request(app).post('/api/mobile/reception').set(auth()).send({ uuid: uuid(), import_id: IMP, palette_id: paletteId, qr });
const ouvrir = async () => (await request(app).post('/api/mobile/palettes').set(auth()).send({ import_id: IMP })).body;
const terminer = (id) => request(app).post(`/api/mobile/palettes/${id}/terminer`).set(auth()).send({});
const poser = (id, emplacement) => request(app).post(`/api/mobile/palettes/${id}/ranger`).set(auth()).send({ uuid: uuid(), emplacement });
const ranger = (qr, emplacement) => request(app).post('/api/mobile/rangement').set(auth()).send({ uuid: uuid(), emplacement, qr });
const petite = (ref, lot, n) => `${ref};17000;${n};${lot};1`;
const auStock = async (code) =>
  (await db.query('SELECT r.reference, p.quantite FROM placements p JOIN receptions r ON r.id = p.reception_id WHERE p.emplacement = ? ORDER BY r.reference', [code]))[0]
    .map((x) => `${x.reference}×${x.quantite}`);

beforeAll(async () => {
  await viderBase();
  await db.query("INSERT INTO parametres (cle, valeur) VALUES ('tampon_capacite', '2') ON DUPLICATE KEY UPDATE valeur = '2'");
  const hash = await bcrypt.hash('test1234', 4);
  await db.query(`INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES (70, '8001', 'Mag', 'Test', ?, 'magasinier'), (71, '8002', 'Chef', 'Test', ?, 'chef_magasin')`, [hash, hash]);
  // Stock existant : une palette de 4 petites P0001 en D005 (2 places libres)
  await db.query(`INSERT INTO imports (id, statut, numero_livraison, date_creation) VALUES (50, 'ajoute', 'LIV-50', NOW() - INTERVAL 9 DAY)`);
  await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES (500, 50, 'bobine', 'petite', 'P0001', '202600001', 4)`);
  await db.query(`INSERT INTO placements (reception_id, emplacement, quantite) VALUES (500, 'D005', 4)`);
  // Import reçu : 7 petites P0001, 3 petites P0002 (mélangées), 1 moyenne M0001, 2 petites P0003, 1 grande G0001
  await db.query(`INSERT INTO imports (id, statut, numero_livraison, date_envoi, date_creation) VALUES (${IMP}, 'en_attente', 'LIV-51', NOW(), NOW())`);
  await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES
    (511, ${IMP}, 'bobine', 'petite', 'P0001', '202600002', 7),
    (512, ${IMP}, 'bobine', 'petite', 'P0002', '202600003', 3),
    (513, ${IMP}, 'bobine', 'moyenne', 'M0001', '202600004', 1),
    (514, ${IMP}, 'bobine', 'petite', 'P0003', '202600005', 2),
    (515, ${IMP}, 'bobine', 'grande', 'G0001', '202600006', 1)`);
  mag = (await request(app).post('/api/auth/login').send({ matricule: '8001', motDePasse: 'test1234' })).body.token;
  chef = (await request(app).post('/api/auth/login').send({ matricule: '8002', motDePasse: 'test1234' })).body.token;
});

afterAll(async () => {
  await db.query("DELETE FROM parametres WHERE cle = 'tampon_capacite'");
  await db.end();
});

describe('palette ouverte : contrôles bobine par bobine', () => {
  let p;
  test('6 petites au maximum, une 7e est refusée', async () => {
    p = await ouvrir();
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const r = await scan(petite('P0001', '202600002', n), p.id);
      expect(r.body).toMatchObject({ resultat: 'conforme', palette: { n, capacite: 6, pleine: n === 6 } });
    }
    const r = await scan(petite('P0001', '202600002', 7), p.id);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/pleine \(6 petites bobines\)/);
  });
  test('une bobine scannée par erreur se retire, puis se rescanne', async () => {
    const vue = (await request(app).get(`/api/mobile/receptions/${IMP}`).set(auth())).body.palettes[0];
    const colis6 = vue.bobines.find((b) => b.colis === 6);
    const r = await request(app).delete(`/api/mobile/palettes/${p.id}/bobines/${colis6.controle_id}`).set(auth());
    expect(r.body.n).toBe(5);
    expect((await scan(petite('P0001', '202600002', 6), p.id)).body.resultat).toBe('conforme');
  });
  test('palette entière : emplacement vide près de la même référence (P0001 en D005)', async () => {
    const t = (await terminer(p.id)).body;
    expect(t.mode).toBe('entiere');
    expect(R.lireCode(t.emplacement).niveau).toBe(0);
    expect(t.emplacement).not.toBe('D005'); // jamais sur une palette déjà en stock
    expect(Math.abs(R.distance(t.emplacement) - R.distance('D005'))).toBeLessThanOrEqual(1);
    expect(t.bobines.every((b) => b.emplacement === t.emplacement)).toBe(true);
    expect((await poser(p.id, t.emplacement)).body.resultat).toBe('bon_emplacement');
    expect(await auStock(t.emplacement)).toEqual(['P0001×6']);
  });
});

describe('tailles et palettes mélangées', () => {
  let p;
  test('références mélangées sur une palette : accepté ; une autre taille : refusée', async () => {
    p = await ouvrir();
    expect((await scan(petite('P0002', '202600003', 1), p.id)).body.resultat).toBe('conforme');
    expect((await scan(petite('P0001', '202600002', 7), p.id)).body.resultat).toBe('conforme');
    const r = await scan(petite('M0001', '202600004', 1), p.id);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/ne mélange pas les tailles/);
  });
  test('emplacement réservé : deux palettes terminées ne reçoivent jamais le même emplacement', async () => {
    const t1 = (await terminer(p.id)).body;
    const p2 = await ouvrir();
    await scan(petite('P0002', '202600003', 2), p2.id);
    const t2 = (await terminer(p2.id)).body;
    expect(t1.mode).toBe('entiere');
    expect(t2.mode).toBe('entiere');
    expect(t2.emplacement).not.toBe(t1.emplacement);
    expect((await poser(p.id, t1.emplacement)).body.resultat).toBe('bon_emplacement');
    expect((await poser(p2.id, t2.emplacement)).body.resultat).toBe('bon_emplacement');
    expect(await auStock(t1.emplacement)).toEqual(['P0001×1', 'P0002×1']);
  });
  test('bobine oubliée : la palette se rouvre et la bobine rejoint le même emplacement', async () => {
    const p2 = (await request(app).get(`/api/mobile/receptions/${IMP}`).set(auth())).body.palettes.find((x) => x.numero === 3);
    expect((await request(app).post(`/api/mobile/palettes/${p2.id}/rouvrir`).set(auth())).body.statut).toBe('ouverte');
    expect((await scan(petite('P0002', '202600003', 3), p2.id)).body.resultat).toBe('conforme');
    const t = (await terminer(p2.id)).body;
    expect(t).toMatchObject({ mode: 'entiere', emplacement: p2.emplacement });
    expect((await poser(p2.id, p2.emplacement)).body.resultat).toBe('bon_emplacement');
    expect(await auStock(p2.emplacement)).toEqual(['P0002×2']);
  });
});

describe('plus d’emplacement vide', () => {
  beforeAll(async () => {
    // Remplir tous les emplacements vides du niveau 0 avec des grandes bobines
    const [occupes] = await db.query('SELECT DISTINCT emplacement FROM placements');
    const pris = new Set(occupes.map((o) => o.emplacement));
    const vides = R.emplacementsParProximite(0).filter((c) => !pris.has(c));
    await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES (501, 50, 'bobine', 'grande', 'G9999', '202600000', ?)`, [vides.length]);
    await db.query('INSERT INTO placements (reception_id, emplacement, quantite) VALUES ?', [vides.map((c) => [501, c, 1])]);
  });

  test('petite palette : divisée, chaque bobine sur une palette commencée (D005 : 4/6)', async () => {
    const p = await ouvrir();
    await scan(petite('P0003', '202600005', 1), p.id);
    await scan(petite('P0003', '202600005', 2), p.id);
    const t = (await terminer(p.id)).body;
    expect(t.mode).toBe('divisee');
    expect(t.bobines.map((b) => b.emplacement)).toEqual(['D005', 'D005']);
    // Rangement bobine par bobine : seul l'emplacement donné est accepté
    expect((await ranger(petite('P0003', '202600005', 1), 'D006')).body.resultat).toBe('faux_emplacement');
    expect((await ranger(petite('P0003', '202600005', 1), 'D005')).body.resultat).toBe('bon_emplacement');
    const r = await ranger(petite('P0003', '202600005', 2), 'D005');
    expect(r.body.message).toMatch(/palette \d+ rangée/);
    expect(await auStock('D005')).toEqual(['P0001×4', 'P0003×2']);
    const vue = (await request(app).get(`/api/mobile/receptions/${IMP}`).set(auth())).body.palettes.find((x) => x.id === p.id);
    expect(vue.statut).toBe('rangee');
  });

  test('aucune place en rayon : palette entière en zone tampon (place vide)', async () => {
    const p = await ouvrir();
    await scan(`M0001;17000;1;202600004;1`, p.id);
    const t = (await terminer(p.id)).body;
    expect(t).toMatchObject({ mode: 'entiere', emplacement: 'T01', tampon: true });
    expect((await poser(p.id, 'T01')).body.resultat).toBe('bon_emplacement');
  });

  test("zone tampon pleine : refus clair ; le chef l'agrandit et la palette trouve sa place", async () => {
    // T02 vide : la grande bobine y va entière ; ensuite il ne reste plus rien
    const p = await ouvrir();
    await scan(`G0001;17000;1;202600006;1`, p.id);
    const t = (await terminer(p.id)).body;
    expect(t).toMatchObject({ mode: 'entiere', emplacement: 'T02' });
    // On simule un autre import qui n'a plus de place nulle part
    await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES (516, ${IMP}, 'bobine', 'grande', 'G0002', '202600007', 1)`);
    const p2 = await ouvrir();
    await scan(`G0002;17000;1;202600007;1`, p2.id);
    const plein = await terminer(p2.id);
    expect(plein.status).toBe(409);
    expect(plein.body.message).toMatch(/agrandir la zone tampon/);
    // Le chef agrandit la zone tampon : la palette trouve sa place
    await db.query("UPDATE parametres SET valeur = '3' WHERE cle = 'tampon_capacite'");
    expect((await terminer(p2.id)).body).toMatchObject({ mode: 'entiere', emplacement: 'T03' });
  });
});

describe('zone tampon réglée par le chef de magasin', () => {
  const jeton = (j) => ({ Authorization: `Bearer ${j}` });
  const regler = (j, capacite) => request(app).put('/api/parametres/tampon').set(jeton(j)).send({ capacite });
  test('le magasinier ne peut pas ; le chef agrandit', async () => {
    expect((await regler(mag, 10)).status).toBe(403);
    expect((await regler(chef, 10)).body).toEqual({ tampon_capacite: 10 });
  });
  test('réduire sous une place réservée à une palette pas encore posée : refusé', async () => {
    // T03 est réservée à la dernière palette (terminée, pas encore posée)
    const r = await regler(chef, 2);
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/T03 est occupée ou réservée/);
  });
  test('étiquettes QR des nouvelles places en PDF', async () => {
    const r = await request(app).get('/api/parametres/tampon/etiquettes?de=4&a=10').set(jeton(chef))
      .buffer(true).parse((res, cb) => { const d = []; res.on('data', (c) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); });
    expect(r.headers['content-disposition']).toMatch(/etiquettes-tampon-T04-T10\.pdf/);
    expect(r.body.slice(0, 5).toString()).toBe('%PDF-');
    expect((await request(app).get('/api/parametres/tampon/etiquettes').set(jeton(mag))).status).toBe(403);
  });
});
