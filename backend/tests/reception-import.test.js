// Lien mobile <-> web : la réception physique d'un import, palette par palette (base de test).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');
const viderBase = require('./vider-base');

let mag;
let chef;
const uuid = () => crypto.randomUUID();
const auth = (j) => ({ Authorization: `Bearer ${j}` });
const scan = (importId, qr, paletteId) =>
  request(app).post('/api/mobile/reception').set(auth(mag)).send({ uuid: uuid(), import_id: importId, palette_id: paletteId, qr });
const ouvrir = (importId) => request(app).post('/api/mobile/palettes').set(auth(mag)).send({ import_id: importId });
const terminerPalette = (id) => request(app).post(`/api/mobile/palettes/${id}/terminer`).set(auth(mag)).send({});
const poser = (id, emplacement) => request(app).post(`/api/mobile/palettes/${id}/ranger`).set(auth(mag)).send({ uuid: uuid(), emplacement });
const terminer = (id) => request(app).post(`/api/mobile/receptions/${id}/terminer`).set(auth(mag)).send({});
const ajouterWeb = (id, corps = {}) => request(app).post(`/api/imports/${id}/ajouter-au-stock`).set(auth(chef)).send(corps);
const imports = async () => Object.fromEntries((await request(app).get('/api/imports').set(auth(chef))).body.map((i) => [i.id, i]));
const colis = (ref, lot, n) => `${ref};13000;${n};${lot};1`;

// Une palette complète : ouverte, ses bobines scannées, terminée, posée à l'emplacement donné
async function palette(importId, qrs) {
  const p = (await ouvrir(importId)).body;
  for (const qr of qrs) expect((await scan(importId, qr, p.id)).body.resultat).toBe('conforme');
  const t = (await terminerPalette(p.id)).body;
  expect((await poser(p.id, t.emplacement)).body.resultat).toBe('bon_emplacement');
  return t;
}

beforeAll(async () => {
  await viderBase();
  const hash = await bcrypt.hash('test1234', 4);
  await db.query(`INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES
    (40, '5001', 'Mag', 'Ali', ?, 'magasinier'), (41, '5002', 'Chef', 'Mona', ?, 'chef_magasin')`, [hash, hash]);
  // Trois livraisons, dans l'ordre d'arrivée : 31 (2 colis), 32 (3 colis), 33 (1 colis)
  await db.query(`INSERT INTO imports (id, statut, numero_livraison, date_envoi, date_creation) VALUES
    (31, 'en_attente', 'LIV-31', NOW() - INTERVAL 4 DAY, NOW()),
    (32, 'en_attente', 'LIV-32', NOW() - INTERVAL 2 DAY, NOW()),
    (33, 'en_attente', 'LIV-33', NOW() - INTERVAL 1 DAY, NOW())`);
  await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES
    (311, 31, 'bobine', 'grande', 'F0391', '202613167', 2),
    (321, 32, 'bobine', 'grande', 'F0411', '202613200', 3),
    (331, 33, 'bobine', 'grande', 'F0500', '202613300', 1)`);
  const login = async (m) => (await request(app).post('/api/auth/login').send({ matricule: m, motDePasse: 'test1234' })).body.token;
  [mag, chef] = await Promise.all([login('5001'), login('5002')]);
});

afterAll(async () => {
  await db.end();
});

test('le web attend la réception mobile pour ajouter au stock', async () => {
  const r = await ajouterWeb(31);
  expect(r.status).toBe(409);
  expect(r.body).toMatchObject({ code: 'reception_requise', recus: 0, attendus: 2 });
});

describe("ordre d'arrivée", () => {
  test('le mobile liste les imports : seul le plus ancien est ouvert à la réception', async () => {
    const r = await request(app).get('/api/mobile/receptions').set(auth(mag));
    expect(r.body.map((i) => [i.numero_livraison, i.prochain, i.bloque])).toEqual([
      ['LIV-31', true, false], ['LIV-32', false, true], ['LIV-33', false, true],
    ]);
    expect(r.body[1].bloque_par).toMatchObject({ id: 31 });
  });
  test('impossible de recevoir un import plus récent avant la fin du plus ancien', async () => {
    const p = await ouvrir(32);
    expect(p.status).toBe(409);
    expect(p.body.message).toMatch(/LIV-31/);
    const s = await scan(32, colis('F0411', '202613200', 1));
    expect(s.status).toBe(409);
  });
});

describe('réception palette par palette', () => {
  let p1;
  test('une bobine sans palette : refusée', async () => {
    const r = await scan(31, colis('F0391', '202613167', 1));
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/Nouvelle palette/);
  });
  test('palette ouverte : la réception passe « en cours » sur le web', async () => {
    p1 = (await ouvrir(31)).body;
    expect(p1).toMatchObject({ numero: 1, statut: 'ouverte', n: 0 });
    expect((await imports())[31].reception).toBe('en_cours');
  });
  test('1 grande bobine = palette pleine ; une 2e est refusée', async () => {
    const r = await scan(31, colis('F0391', '202613167', 1), p1.id);
    expect(r.body).toMatchObject({ resultat: 'conforme', palette: { numero: 1, n: 1, capacite: 1, pleine: true } });
    const plein = await scan(31, colis('F0391', '202613167', 2), p1.id);
    expect(plein.status).toBe(409);
    expect(plein.body.message).toMatch(/pleine/);
  });
  test('un colis d’un autre import est signalé, pas ajouté à la palette', async () => {
    const p2 = (await ouvrir(31)).body;
    const r = await scan(31, colis('F0411', '202613200', 1), p2.id);
    expect(r.body.resultat).toBe('inconnu');
    expect(r.body.message).toMatch(/LIV-32/);
    expect((await request(app).get('/api/mobile/receptions/31').set(auth(mag))).body.palettes.find((p) => p.id === p2.id).n).toBe(0);
  });
  test('palette terminée : un emplacement entièrement vide, réservé, posé en un scan', async () => {
    const t = (await terminerPalette(p1.id)).body;
    expect(t).toMatchObject({ statut: 'terminee', mode: 'entiere', emplacement: 'D000' }); // magasin vide : le plus proche de la porte
    expect((await poser(p1.id, 'D001')).body.resultat).toBe('faux_emplacement');
    expect((await db.query('SELECT COUNT(*) AS n FROM placements WHERE reception_id = 311'))[0][0].n).toBe(0);
    const r = await poser(p1.id, 'D000');
    expect(r.body).toMatchObject({ resultat: 'bon_emplacement', titre: 'Ajouté au stock' });
    // au stock tout de suite, même si l'import n'est pas encore validé
    const stock = await request(app).get('/api/stock').set(auth(chef));
    expect(stock.body.find((l) => l.reference === 'F0391')).toMatchObject({ emplacement: 'D000', quantite: 1 });
  });
  test('2e palette : un autre emplacement vide', async () => {
    const p2 = (await request(app).get('/api/mobile/receptions/31').set(auth(mag))).body.palettes.find((p) => p.statut === 'ouverte');
    expect((await scan(31, colis('F0391', '202613167', 2), p2.id)).body.resultat).toBe('conforme');
    const t = (await terminerPalette(p2.id)).body;
    expect(t.mode).toBe('entiere');
    expect(t.emplacement).not.toBe('D000');
    expect((await poser(p2.id, t.emplacement)).body.resultat).toBe('bon_emplacement');
  });
  test('réception complète sans écart : import validé automatiquement, rien à replanifier', async () => {
    const r = await terminer(31);
    expect(r.body).toMatchObject({ etape: 'ajoute', ajoute: true, ajoutes_automatiquement: [31], reclamations_creees: 0 });
    const [[pl]] = await db.query('SELECT COUNT(*) AS n FROM plans_rangement WHERE reception_id = 311');
    expect(pl.n).toBe(0); // les bobines sont déjà rangées par palette
    const [[p]] = await db.query('SELECT SUM(quantite) AS q FROM placements WHERE reception_id = 311');
    expect(Number(p.q)).toBe(2);
  });
});

describe('import suivant : palettes non posées, écarts', () => {
  let p2;
  test("31 terminé : 32 s'ouvre à la réception", async () => {
    const r = await request(app).get('/api/mobile/receptions').set(auth(mag));
    expect(r.body.find((i) => i.id === 32).bloque).toBe(false);
    await palette(32, [colis('F0411', '202613200', 1)]);
  });
  test('terminer la réception avec une palette pas encore posée : refusé', async () => {
    p2 = (await ouvrir(32)).body;
    await scan(32, colis('F0411', '202613200', 2), p2.id);
    await terminerPalette(p2.id);
    const r = await terminer(32);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ palettes: [p2.numero] });
  });
  test('réception avec écarts : réclamations automatiques, « à valider » sur le web', async () => {
    const t = (await request(app).get('/api/mobile/receptions/32').set(auth(mag))).body.palettes.find((p) => p.id === p2.id);
    expect((await poser(p2.id, t.emplacement)).body.resultat).toBe('bon_emplacement');
    const p3 = (await ouvrir(32)).body;
    expect((await scan(32, colis('F9999', '202619999', 1), p3.id)).body.resultat).toBe('inconnu'); // hors import
    const r = await terminer(32); // la palette 3, vide, est abandonnée
    expect(r.body).toMatchObject({ etape: 'a_valider', ajoute: false, reclamations_creees: 2 });
    const [rc] = await db.query('SELECT reception_id, import_id, reference, motif, quantite, origine FROM reclamations WHERE import_id = 32 ORDER BY id');
    expect(rc).toEqual([
      { reception_id: null, import_id: 32, reference: 'F9999', motif: 'non_commande', quantite: 1, origine: 'reception_mobile' },
      { reception_id: 321, import_id: 32, reference: null, motif: 'manquant', quantite: 1, origine: 'reception_mobile' },
    ].sort((a, b) => (a.motif === 'manquant') - (b.motif === 'manquant')));
    expect((await imports())[32].etape).toBe('a_valider');
    expect((await db.query('SELECT COUNT(*) AS n FROM palettes_reception WHERE import_id = 32'))[0][0].n).toBe(2);
    // scanner après la fin : refusé
    expect((await scan(32, colis('F0411', '202613200', 3))).body.resultat).toBe('deja_traite');
  });
  test('le chef valide : les bobines rangées restent, rien de plus à ranger', async () => {
    const r = await ajouterWeb(32);
    expect(r.status).toBe(200);
    expect((await imports())[32].statut).toBe('ajoute');
    const [[p]] = await db.query('SELECT SUM(quantite) AS q FROM placements WHERE reception_id = 321');
    expect(Number(p.q)).toBe(2); // 3 annoncés - 1 manquant réclamé
    expect((await db.query('SELECT COUNT(*) AS n FROM plans_rangement WHERE reception_id = 321'))[0][0].n).toBe(0);
  });
  test('les réclamations du mobile apparaissent sur la page Réclamations, hors import compris', async () => {
    const r = await request(app).get('/api/reclamations').set(auth(chef));
    const i32 = r.body.find((i) => i.import_id === 32);
    expect(i32.produits.map((p) => p.reference).sort()).toEqual(['F0411', 'F9999']);
  });
});

describe("le chef change l'emplacement d'une palette pas encore posée", () => {
  let p;
  let affectation;
  beforeAll(async () => {
    p = (await ouvrir(33)).body;
    await scan(33, colis('F0500', '202613300', 1), p.id);
    p = (await terminerPalette(p.id)).body;
    [[affectation]] = await db.query('SELECT id, emplacement FROM affectations_colis WHERE palette_id = ?', [p.id]);
  });
  const changer = (jeton, corps) => request(app).put(`/api/imports/affectations/${affectation.id}`).set(auth(jeton)).send(corps);

  test('le magasinier ne peut pas', async () => {
    expect((await changer(mag, { emplacement: 'D009', motif: 'emplacement_bloque' })).status).toBe(403);
  });
  test('motif obligatoire, emplacement existant', async () => {
    expect((await changer(chef, { emplacement: 'D009' })).status).toBe(400);
    expect((await changer(chef, { emplacement: 'Z999', motif: 'emplacement_bloque' })).status).toBe(400);
  });
  test('règles du magasin : une bobine ne va pas au niveau des cosses', async () => {
    expect((await changer(chef, { emplacement: 'D109', motif: 'emplacement_bloque' })).status).toBe(409);
  });
  test('changé : la palette suit, historique noté, le mobile impose le nouvel emplacement', async () => {
    const r = await changer(chef, { emplacement: 'D009', motif: 'emplacement_bloque', commentaire: 'lisse abîmée' });
    expect(r.body).toMatchObject({ emplacement: 'D009', palette: p.numero, bobines: 1 });
    const [[m]] = await db.query("SELECT origine, depuis, vers, motif, commentaire FROM mouvements_emplacement WHERE vers = 'D009'");
    expect(m).toMatchObject({ origine: 'plan_import', depuis: affectation.emplacement, vers: 'D009', motif: 'emplacement_bloque', commentaire: 'Palette 1 (1 bobine) : lisse abîmée' });
    expect((await poser(p.id, affectation.emplacement)).body.resultat).toBe('faux_emplacement');
    expect((await poser(p.id, 'D009')).body.resultat).toBe('bon_emplacement');
  });
  test('bobine déjà rangée : on ne change plus son emplacement ici', async () => {
    expect((await changer(chef, { emplacement: 'D010', motif: 'emplacement_bloque' })).status).toBe(409);
  });
  test('la page Import affiche la palette et l’emplacement de chaque colis', async () => {
    const prod = (await imports())[33].produits.find((x) => x.id === 331);
    expect(prod.affectations).toEqual([{ id: affectation.id, colis: 1, emplacement: 'D009', range: true, palette: 1 }]);
    expect((await terminer(33)).body).toMatchObject({ etape: 'ajoute', ajoute: true });
  });
});

describe('secours sans mobile', () => {
  beforeAll(async () => {
    await db.query(`INSERT INTO imports (id, statut, numero_livraison, date_envoi) VALUES (34, 'en_attente', 'LIV-34', NOW())`);
    await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES (341, 34, 'bobine', 'grande', 'F0600', '202613400', 1)`);
  });
  test('le magasinier ne peut pas forcer', async () => {
    const r = await request(app).post('/api/imports/34/ajouter-au-stock').set(auth(mag)).send({ force: true, motif_force: 'panne' });
    expect(r.status).toBe(409);
  });
  test('le chef doit donner un motif', async () => {
    expect((await ajouterWeb(34, { force: true })).status).toBe(400);
  });
  test('avec motif : ajouté, et marqué « sans contrôle mobile »', async () => {
    expect((await ajouterWeb(34, { force: true, motif_force: 'Téléphone en panne' })).status).toBe(200);
    expect((await imports())[34]).toMatchObject({ statut: 'ajoute', ajout_force: true, motif_force: 'Téléphone en panne' });
    // secours : pas de téléphone, tout entre au stock tout de suite
    const [[p]] = await db.query('SELECT SUM(quantite) AS q FROM placements WHERE reception_id = 341');
    expect(Number(p.q)).toBe(1);
  });
});

test('le web voit les numéros des colis reçus (même référence, même lot, colis différents)', async () => {
  const p = (await imports())[31].produits[0];
  expect(p).toMatchObject({ reference: 'F0391', recus: 2, colis_recus: [1, 2] });
  expect(p.affectations.map((a) => a.palette)).toEqual([1, 2]);
});

describe('journal des alertes (web)', () => {
  test('réservé au chef, alertes par défaut, résumé par magasinier', async () => {
    expect((await request(app).get('/api/journal').set(auth(mag))).status).toBe(403);
    const j = await request(app).get('/api/journal').set(auth(chef));
    expect(j.body.length).toBeGreaterThan(0);
    expect(j.body.every((l) => ['ecart_quantite', 'faux_emplacement', 'inconnu', 'mauvais_produit', 'stock_modifie'].includes(l.resultat))).toBe(true);
    const tout = await request(app).get('/api/journal?niveau=tout&controle=reception').set(auth(chef));
    expect(tout.body.length).toBeGreaterThan(j.body.length);
    const r = await request(app).get('/api/journal/resume').set(auth(chef));
    expect(r.body.par_magasinier[0]).toMatchObject({ matricule: '5001' });
    expect(r.body.total).toBeGreaterThan(r.body.alertes);
  });
  test('export Excel et PDF', async () => {
    const x = await request(app).get('/api/journal/excel').set(auth(chef));
    expect(x.headers['content-type']).toMatch(/spreadsheetml/);
    const p = await request(app).get('/api/journal/pdf').set(auth(chef)).buffer(true).parse((res, cb) => {
      const d = []; res.on('data', (c) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d)));
    });
    expect(p.body.slice(0, 5).toString()).toBe('%PDF-');
  });
});
