// Sortie préparée sur le mobile, sur la base de test (voir tests/base-de-test.js).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');
const viderBase = require('./vider-base');

const uuid = () => crypto.randomUUID();
let ali; // magasinier 1
let sami; // magasinier 2
let chef;

const auth = (jeton) => ({ Authorization: `Bearer ${jeton}` });
const preparer = (jeton, corps, id = uuid()) =>
  request(app).post('/api/mobile/export/preparer').set(auth(jeton)).send({ uuid: id, destination: 'P1', ...corps });
const scanner = (jeton, prep, emplacement, qr, extra = {}) =>
  request(app).post(`/api/mobile/export/${prep}/scan`).set(auth(jeton)).send({ uuid: uuid(), emplacement, qr, ...extra });
const placements = async () => (await db.query('SELECT reception_id, emplacement, quantite FROM placements ORDER BY id'))[0];

beforeAll(async () => {
  await viderBase();
  const hash = await bcrypt.hash('test1234', 4);
  await db.query(
    `INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES
       (20, '3001', 'Ali', 'Ali', ?, 'magasinier'), (21, '3002', 'Sami', 'Sami', ?, 'magasinier'), (22, '3003', 'Chef', 'Mona', ?, 'chef_magasin')`,
    [hash, hash, hash]
  );
  // F0411 : trois lots, du plus ancien au plus récent (A en D000, B en D002, C en D003). C9999 en D005.
  await db.query(`INSERT INTO imports (id, statut, date_creation, date_ajout_stock) VALUES (10, 'ajoute', NOW(), NOW())`);
  await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite, date_reception) VALUES
    (11, 10, 'bobine', 'grande', 'F0411', '202613001', 1, NOW() - INTERVAL 3 DAY),
    (12, 10, 'bobine', 'grande', 'F0411', '202613002', 1, NOW() - INTERVAL 2 DAY),
    (13, 10, 'bobine', 'grande', 'F0411', '202613003', 1, NOW() - INTERVAL 1 DAY),
    (14, 10, 'bobine', 'grande', 'C9999', '202613009', 1, NOW())`);
  await db.query(`INSERT INTO placements (reception_id, emplacement, quantite) VALUES (11, 'D000', 1), (12, 'D002', 1), (13, 'D003', 1), (14, 'D005', 1)`);
  const login = async (m) => (await request(app).post('/api/auth/login').send({ matricule: m, motDePasse: 'test1234' })).body.token;
  [ali, sami, chef] = await Promise.all([login('3001'), login('3002'), login('3003')]);
});

afterAll(async () => {
  await db.end();
});

describe('préparation FIFO', () => {
  let prep;
  const id = uuid();

  test('les prélèvements suivent le FIFO : lots les plus anciens', async () => {
    const r = await preparer(ali, { reference: 'f0411', quantite: 2 }, id);
    expect(r.status).toBe(201);
    prep = r.body;
    expect(prep.lignes.map((l) => [l.emplacement, l.lot])).toEqual([['D000', '202613001'], ['D002', '202613002']]);
    expect(prep.restants).toBe(2);
  });

  test('même uuid renvoyé : la même préparation', async () => {
    const r = await preparer(ali, { reference: 'F0411', quantite: 2 }, id);
    expect(r.body).toMatchObject({ id: prep.id, rejoue: true });
  });

  test('une seule sortie en cours par magasinier', async () => {
    const r = await preparer(ali, { reference: 'F0411', quantite: 1 });
    expect(r.status).toBe(409);
  });

  test('destination obligatoire', async () => {
    const r = await preparer(sami, { reference: 'F0411', quantite: 1, destination: 'X' });
    expect(r.status).toBe(400);
  });

  test('les produits réservés ne sont pas proposés à une autre sortie', async () => {
    const trop = await preparer(sami, { reference: 'F0411', quantite: 2 });
    expect(trop.status).toBe(409);
    expect(trop.body.message).toMatch(/réservé/);
  });

  test('un autre magasinier ne voit pas cette sortie', async () => {
    const r = await request(app).get(`/api/mobile/export/${prep.id}`).set(auth(sami));
    expect(r.status).toBe(403);
  });

  describe('scans', () => {
    test('mauvais emplacement : alerte, rien ne sort', async () => {
      const avant = await placements();
      const r = await scanner(ali, prep.id, 'D005', 'F0411;202613001;1');
      expect(r.body.resultat).toBe('faux_emplacement');
      expect(r.body.couleur).toBe('rouge');
      expect(r.body.message).toMatch(/enregistré en D000/);
      expect(await placements()).toEqual(avant);
    });

    test('bon emplacement mais lot non FIFO : alerte', async () => {
      const r = await scanner(ali, prep.id, 'D000', 'F0411;202613003;1');
      expect(r.body.resultat).toBe('mauvais_produit');
      expect(r.body.message).toMatch(/FIFO.*202613001/);
    });

    test('bon emplacement mais autre référence : alerte', async () => {
      const r = await scanner(ali, prep.id, 'D000', 'C9999;202613009;1');
      expect(r.body.resultat).toBe('mauvais_produit');
      expect(r.body.message).toMatch(/C9999 au lieu de F0411/);
    });

    test('bon produit au bon emplacement : validé, le stock ne bouge pas encore', async () => {
      const avant = await placements();
      const r = await scanner(ali, prep.id, 'EMPL:D000', 'F0411;202613001;1');
      expect(r.body.resultat).toBe('prelevement_ok');
      expect(r.body.couleur).toBe('vert');
      expect(r.body.preparation.restants).toBe(1);
      expect(r.body.emplacements_prevus).toEqual([{ code: 'D002', quantite: 1 }]);
      expect(await placements()).toEqual(avant);
    });

    test('même prélèvement rescanné : déjà validé', async () => {
      const r = await scanner(ali, prep.id, 'D000', 'F0411;202613001;1');
      expect(r.body.resultat).toBe('deja_traite');
    });

    test('dernier prélèvement : sortie enregistrée comme sur le web', async () => {
      const r = await scanner(ali, prep.id, 'D002', 'F0411;202613002;1');
      expect(r.body.resultat).toBe('sortie_terminee');
      expect(r.body.places_liberees.sort()).toEqual(['D000', 'D002']);
      const restant = (await placements()).map((p) => p.emplacement).sort();
      expect(restant).toEqual(['D003', 'D005']);
      const web = await request(app).get('/api/exports').set(auth(chef));
      const e = web.body.find((x) => x.id === r.body.export_id);
      expect(e).toMatchObject({ reference: 'F0411', quantite: 2, destination: 'P1' });
      expect(e.details.map((d) => d.lot)).toEqual(['202613001', '202613002']);
    });

    test('scan après la fin : refusé', async () => {
      const r = await scanner(ali, prep.id, 'D003', 'F0411;202613003;1');
      expect(r.body.resultat).toBe('preparation_close');
    });

    test('les alertes de la sortie sont dans le journal', async () => {
      const j = await request(app).get('/api/mobile/journal').set(auth(chef));
      const resultats = j.body.filter((l) => l.controle === 'export').map((l) => l.resultat).sort();
      expect(resultats).toEqual(['faux_emplacement', 'mauvais_produit', 'mauvais_produit']);
      expect(j.body.find((l) => l.controle === 'export').preparation_id).toBe(prep.id);
    });
  });
});

describe('cas particuliers', () => {
  test('annuler une sortie libère les produits réservés', async () => {
    const p = await preparer(sami, { reference: 'F0411', quantite: 1 });
    expect(p.body.lignes[0]).toMatchObject({ emplacement: 'D003', lot: '202613003' });
    const a = await request(app).post(`/api/mobile/export/${p.body.id}/annuler`).set(auth(sami));
    expect(a.body.statut).toBe('annulee');
    const encore = await preparer(sami, { reference: 'F0411', quantite: 1 });
    expect(encore.status).toBe(201);
    await request(app).post(`/api/mobile/export/${encore.body.id}/annuler`).set(auth(sami));
  });

  test('deux scans du même prélèvement en même temps : un seul validé', async () => {
    const p = await preparer(sami, { reference: 'C9999', quantite: 1 });
    const [a, b] = await Promise.all([
      scanner(sami, p.body.id, 'D005', 'C9999;202613009;1'),
      scanner(sami, p.body.id, 'D005', 'C9999;202613009;1'),
    ]);
    expect([a.body.resultat, b.body.resultat].sort()).toEqual(['preparation_close', 'sortie_terminee']);
    expect((await placements()).map((x) => x.emplacement)).toEqual(['D003']);
  });

  test('le web respecte les produits réservés par une sortie en cours sur le mobile', async () => {
    const p = await preparer(ali, { reference: 'F0411', quantite: 1 });
    expect(p.body.lignes[0].emplacement).toBe('D003');
    // sortie de secours du chef sur le même produit : le dernier F0411 est réservé par le mobile
    const web = await request(app).post('/api/exports').set(auth(chef))
      .send({ reference: 'F0411', quantite: 1, destination: 'P2', force: true, motif_force: 'Test' });
    expect(web.status).toBe(409);
    await request(app).post(`/api/mobile/export/${p.body.id}/annuler`).set(auth(ali));
  });

  test('stock modifié pendant la préparation (produit déplacé) : rien ne sort', async () => {
    const p = await preparer(ali, { reference: 'F0411', quantite: 1 });
    // le produit change d'emplacement pendant la préparation
    await db.query("UPDATE placements SET emplacement = 'D009' WHERE emplacement = 'D003'");
    const r = await scanner(ali, p.body.id, 'D003', 'F0411;202613003;1');
    expect(r.body.resultat).toBe('stock_modifie');
    const [[etat]] = await db.query('SELECT statut FROM preparations_export WHERE id = ?', [p.body.id]);
    expect(etat.statut).toBe('annulee');
    await db.query("UPDATE placements SET emplacement = 'D003' WHERE emplacement = 'D009'");
  });

  test('sortie en cours : reprise après fermeture de l’application', async () => {
    const p = await preparer(sami, { reference: 'X', quantite: 1 });
    expect(p.status).toBe(409); // référence absente du stock
    const r = await request(app).get('/api/mobile/export/en-cours').set(auth(sami));
    expect(r.body).toBeNull();
  });
});

describe('sortie avec tickets fournisseur : un scan par colis', () => {
  beforeAll(async () => {
    await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite, date_reception) VALUES (15, 10, 'bobine', 'petite', 'F0391', '202613167', 3, NOW())`);
    await db.query(`INSERT INTO placements (reception_id, emplacement, quantite) VALUES (15, 'D010', 3)`);
  });

  test('2 colis à prendre : 2 scans de colis différents', async () => {
    const p = await preparer(ali, { reference: 'F0391', quantite: 2 });
    expect(p.body.lignes).toEqual([expect.objectContaining({ emplacement: 'D010', quantite: 2, preleves: 0 })]);
    const a = await scanner(ali, p.body.id, 'D010', 'F0391;13000;7;202613167;1');
    expect(a.body.resultat).toBe('prelevement_ok');
    expect(a.body.message).toMatch(/1\/2/);
    const b = await scanner(ali, p.body.id, 'D010', 'F0391;13000;7;202613167;1');
    expect(b.body.resultat).toBe('deja_traite'); // même colis
    const c = await scanner(ali, p.body.id, 'D010', 'F0391;13000;8;202613167;1');
    expect(c.body.resultat).toBe('sortie_terminee');
    const [[reste]] = await db.query('SELECT quantite FROM placements WHERE reception_id = 15');
    expect(reste.quantite).toBe(1);
  });
});

describe('sorties : par le mobile, secours web encadré', () => {
  const sortieWeb = (jeton, corps) => request(app).post('/api/exports').set(auth(jeton)).send({ reference: 'F0411', quantite: 1, destination: 'P3', ...corps });

  test('sans secours, le web renvoie vers le mobile', async () => {
    const r = await sortieWeb(chef, {});
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('sortie_mobile_requise');
  });

  test('le magasinier ne peut pas faire de sortie de secours', async () => {
    expect((await sortieWeb(ali, { force: true, motif_force: 'panne' })).status).toBe(409);
  });

  test('le chef doit donner un motif', async () => {
    expect((await sortieWeb(chef, { force: true })).status).toBe(400);
  });

  test('secours du chef avec motif : FIFO, enregistré « secours web »', async () => {
    const r = await sortieWeb(chef, { force: true, motif_force: 'Téléphone en panne' });
    expect(r.status).toBe(201);
    const [[e]] = await db.query('SELECT origine, motif_force FROM exports WHERE id = ?', [r.body.id]);
    expect(e).toEqual({ origine: 'web_secours', motif_force: 'Téléphone en panne' });
  });

  test('les sorties faites sur le mobile sont marquées « mobile »', async () => {
    const [mob] = await db.query("SELECT DISTINCT origine FROM exports WHERE destination IN ('P1')");
    expect(mob.map((x) => x.origine)).toEqual(['mobile']);
  });
});
