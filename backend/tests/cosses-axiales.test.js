// Cosses axiales (petites) : 3 au maximum par emplacement, sur la même palette que les cosses plates
// (10 au maximum), chacune comptée à part ; à l'import elles se reçoivent une par une, sans palette.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');
const R = require('../src/rangement');
const viderBase = require('./vider-base');

let mag;
const auth = () => ({ Authorization: `Bearer ${mag}` });
const IMP = 66;
const scan = (qr, paletteId) => request(app).post('/api/mobile/reception').set(auth()).send({ uuid: crypto.randomUUID(), import_id: IMP, palette_id: paletteId, qr });
const colis = (ref, lot, n) => `${ref};13000;${n};${lot};1`;
const cosse = (reference, typeCosse, quantite, emplacement, id) => ({
  id, reception_id: id, reference, lot: '202600001', type: 'cosse', type_cosse: typeCosse, quantite, emplacement, date_reception: '2026-10-20T08:00:00',
});
const plan = (lignes, enPlace) => R.proposerPlan(lignes, enPlace, { capaciteTampon: 0, limites: R.LIMITES_CONNECTEUR_DEFAUT });

describe('règles du magasin (moteur)', () => {
  test('capacité : 10 plates et 3 axiales, comptées à part', () => {
    expect(R.capacite({ type: 'cosse', type_cosse: 'plat' })).toBe(10);
    expect(R.capacite({ type: 'cosse', type_cosse: 'axiale' })).toBe(3);
    expect(R.capacite({ type: 'cosse', type_cosse: null })).toBe(10); // type inconnu : plate
  });
  test('une palette de 10 plates reçoit encore 3 axiales, pas une 4e', () => {
    const enPlace = [cosse('P0001', 'plat', 10, 'D100', 1)];
    const r = plan([cosse('A0001', 'axiale', 4, null, 2)], enPlace);
    // les 3 premières vont sur la palette commencée (pas sur un emplacement vide), la 4e ailleurs
    expect(r.find((p) => p.emplacement === 'D100').quantite).toBe(3);
    expect(r.find((p) => p.emplacement !== 'D100').quantite).toBe(1);
    const refus = R.verifierPlan([{ id: 2, emplacement: 'D100', quantite: 4 }], [cosse('A0001', 'axiale', 4, null, 2)], enPlace, 0);
    expect(refus).toMatch(/plein pour les cosses axiales : une palette en contient au maximum 3/);
  });
  test('les axiales ne prennent pas la place des plates : 3 axiales + 10 plates', () => {
    const enPlace = [cosse('A0001', 'axiale', 3, 'D100', 1)];
    expect(R.verifierPlan([{ id: 2, emplacement: 'D100', quantite: 10 }], [cosse('P0001', 'plat', 10, null, 2)], enPlace, 0)).toBe(null);
    expect(R.verifierPlan([{ id: 2, emplacement: 'D100', quantite: 11 }], [cosse('P0001', 'plat', 11, null, 2)], enPlace, 0)).toMatch(/10 cosses plates/);
  });
});

describe('réception d’un import', () => {
  beforeAll(async () => {
    await viderBase();
    const hash = await bcrypt.hash('test1234', 4);
    await db.query(`INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES (75, '8301', 'Mag', 'Axiale', ?, 'magasinier')`, [hash]);
    await db.query(`INSERT INTO imports (id, statut, numero_livraison, date_envoi, date_creation) VALUES (${IMP}, 'en_attente', 'LIV-66', NOW(), NOW())`);
    await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, type_cosse, reference, lot, quantite) VALUES
      (661, ${IMP}, 'cosse', NULL, 'plat', 'P0001', '202600001', 2), (662, ${IMP}, 'cosse', NULL, 'axiale', 'A0001', '202600002', 2)`);
    mag = (await request(app).post('/api/auth/login').send({ matricule: '8301', motDePasse: 'test1234' })).body.token;
  });
  afterAll(async () => {
    await db.end();
  });

  test('une cosse plate sans palette : refusée ; une cosse axiale : reçue une par une, sans palette', async () => {
    expect((await scan(colis('P0001', '202600001', 1))).status).toBe(409);
    const r = await scan(colis('A0001', '202600002', 1));
    expect(r.body).toMatchObject({ resultat: 'conforme', colis: { recus: 1, attendus: 2 } });
    expect(r.body.palette).toBeUndefined();
  });
  test('une axiale scannée palette ouverte ne va pas sur la palette', async () => {
    const p = (await request(app).post('/api/mobile/palettes').set(auth()).send({ import_id: IMP })).body;
    expect((await scan(colis('P0001', '202600001', 1), p.id)).body.palette).toMatchObject({ type: 'cosse', n: 1, capacite: 10 });
    const r = await scan(colis('A0001', '202600002', 2), p.id);
    expect(r.body.resultat).toBe('conforme');
    expect(r.body.palette).toBeUndefined();
    const vue = (await request(app).get(`/api/mobile/receptions/${IMP}`).set(auth())).body;
    expect(vue.palettes[0].n).toBe(1);
    expect(vue.lignes.find((l) => l.reference === 'A0001')).toMatchObject({ type_cosse: 'axiale', recus: 2 });
  });
});
