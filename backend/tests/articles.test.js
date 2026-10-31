// Catalogue des articles (administrateur), sur la base de test.
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');
const viderBase = require('./vider-base');
const { familleDe, lireArticle, tailleDeBobine } = require('../src/articles');

let admin;
let chef;
const auth = (j) => ({ Authorization: `Bearer ${j}` });

beforeAll(async () => {
  await viderBase();
  const hash = await bcrypt.hash('test1234', 4);
  await db.query('UPDATE utilisateurs SET mot_de_passe = ? WHERE id = 1', [hash]);
  await db.query(`INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES (60, '6001', 'Chef', 'Test', ?, 'chef_magasin')`, [hash]);
  const [[a]] = await db.query('SELECT matricule FROM utilisateurs WHERE id = 1');
  const login = async (m) => (await request(app).post('/api/auth/login').send({ matricule: m, motDePasse: 'test1234' })).body.token;
  [admin, chef] = await Promise.all([login(a.matricule), login('6001')]);
});

afterAll(async () => {
  await db.end();
});

test('famille déduite de la catégorie du fichier : tout le reste est connecteur', () => {
  expect([familleDe('BOBINE'), familleDe('cosse'), familleDe('GCOR'), familleDe('COMPOSANT PLASTIQUE')]).toEqual(['bobine', 'cosse', 'connecteur', 'connecteur']);
  // les références réelles gardent espaces, virgules, barres et tirets
  expect(lireArticle({ reference: ' cav  b0,75 /17 ', famille: 'bobine' }).article).toEqual({ reference: 'CAV B0,75 /17', famille: 'bobine', categorie: 'BOBINE', bobines_par_palette: 6, type_cosse: null });
  expect(lireArticle({ reference: 'f0253', famille: 'cosse', type_cosse: 'axiale' }).article).toEqual({ reference: 'F0253', famille: 'cosse', categorie: 'COSSE', bobines_par_palette: null, type_cosse: 'axiale' });
  expect(lireArticle({ reference: 'F0391', famille: 'cosse', type_cosse: 'ronde' }).erreur).toMatch(/axiale ou plat/);
  expect(lireArticle({ reference: 'C1', famille: 'bobine', bobines_par_palette: '2' }).article).toMatchObject({ bobines_par_palette: 2 });
  expect(lireArticle({ reference: 'C1', famille: 'bobine', bobines_par_palette: 4 }).erreur).toMatch(/taille/);
  expect(tailleDeBobine(1)).toBe('grande');
  expect(tailleDeBobine(2)).toBe('moyenne');
  expect(tailleDeBobine(6)).toBe('petite');
  expect(tailleDeBobine(null)).toBe('petite');
  expect(lireArticle({ reference: 'X1', famille: 'connecteur' }).erreur).toMatch(/famille de connecteur/);
  expect(lireArticle({ reference: 'X1', famille: 'connecteur', categorie: 'cosse' }).erreur).toMatch(/famille à part/);
});

test("réservé à l'administrateur", async () => {
  expect((await request(app).get('/api/articles').set(auth(chef))).status).toBe(403);
});

describe('synchronisation : le type vient du catalogue d’après la référence', () => {
  beforeAll(async () => {
    await db.query('DELETE FROM italie_imports');
    await db.query(`INSERT INTO articles_mp (reference, famille, categorie, bobines_par_palette) VALUES
      ('CFLR9YAT30035800002T', 'bobine', 'BOBINE', 6), ('F0391', 'cosse', 'COSSE', NULL), ('GCOR 4,5T3 A125 L.110 DELFINGEN', 'connecteur', 'GCOR', NULL),
      ('CFHLR2GBT50400450000T', 'bobine', 'BOBINE', 2), ('CAVBIP 2 X 1', 'bobine', 'BOBINE', 1), ('CFLR9YBT30050050000T', 'bobine', 'BOBINE', 6)`);
    // Import italien sans type ni taille (comme la vraie base) ; F0391 annoncé « grande bobine » par erreur
    await db.query(`INSERT INTO italie_imports (id, numero, date_envoi) VALUES (901, 'LIV-CAT-1', NOW() - INTERVAL 1 HOUR), (902, 'LIV-CAT-2', NOW())`);
    await db.query(`INSERT INTO italie_produits (italie_import_id, type, taille_bobine, reference, lot, quantite, longueur, largeur, hauteur, poids) VALUES
      (901, NULL, NULL, 'cflr9yat30035800002t', '202614133', 6, NULL, NULL, NULL, NULL),
      (901, 'bobine', 'grande', 'F0391', '202613167', 2, NULL, NULL, NULL, NULL),
      (901, NULL, NULL, 'GCOR  4,5T3 A125 L.110 DELFINGEN', '202615000', 2, 40, 30, 20, 5),
      (901, NULL, NULL, 'CFHLR2GBT50400450000T', '202614000', 2, NULL, NULL, NULL, NULL),
      (901, NULL, NULL, 'CAVBIP 2 X 1', '202614001', 1, NULL, NULL, NULL, NULL),
      (901, 'bobine', 'moyenne', 'CFLR9YBT30050050000T', '202614002', 2, NULL, NULL, NULL, NULL),
      (902, NULL, NULL, 'INCONNUE123', '1', 1, NULL, NULL, NULL, NULL)`);
  });
  afterAll(async () => {
    await db.query('DELETE FROM italie_imports');
    await db.query('DELETE FROM imports');
    await db.query('DELETE FROM articles_mp');
  });

  test('bobine → taille d’après les bobines par palette (sauf taille donnée par l’Italie), cosse et connecteur reconnus ; référence inconnue signalée', async () => {
    const r = await request(app).post('/api/imports/synchroniser').set(auth(chef));
    expect(r.status).toBe(200);
    expect(r.body.ajoutes.map((a) => a.numero)).toEqual(['LIV-CAT-1']);
    expect(r.body.ignores).toEqual([{ numero: 'LIV-CAT-2', raison: expect.stringMatching(/INCONNUE123 absente du catalogue Articles/) }]);
    const [lignes] = await db.query(
      'SELECT type, taille_bobine, reference, quantite FROM receptions WHERE import_id = ? ORDER BY id',
      [r.body.ajoutes[0].id]
    );
    expect(lignes).toEqual([
      { type: 'bobine', taille_bobine: 'petite', reference: 'CFLR9YAT30035800002T', quantite: 6 },
      { type: 'cosse', taille_bobine: null, reference: 'F0391', quantite: 2 },
      // connecteur : une ligne par carton
      { type: 'connecteur', taille_bobine: null, reference: 'GCOR 4,5T3 A125 L.110 DELFINGEN', quantite: 1 },
      { type: 'connecteur', taille_bobine: null, reference: 'GCOR 4,5T3 A125 L.110 DELFINGEN', quantite: 1 },
      { type: 'bobine', taille_bobine: 'moyenne', reference: 'CFHLR2GBT50400450000T', quantite: 2 },
      { type: 'bobine', taille_bobine: 'grande', reference: 'CAVBIP 2 X 1', quantite: 1 },
      { type: 'bobine', taille_bobine: 'moyenne', reference: 'CFLR9YBT30050050000T', quantite: 2 },
    ]);
  });
});

describe("import saisi à la main par l'administrateur (essais)", () => {
  beforeAll(async () => {
    await db.query(`INSERT INTO articles_mp (reference, famille, categorie) VALUES
      ('CFLR9YAT30035800002T', 'bobine', 'BOBINE'), ('W0714', 'cosse', 'COSSE'), ('PI4V 3510 52K03', 'connecteur', 'CONNECTEUR LUMB')`);
  });
  afterAll(async () => {
    await db.query('DELETE FROM italie_imports');
    await db.query('DELETE FROM imports');
    await db.query('DELETE FROM articles_mp');
  });
  const manuel = (jeton, corps) => request(app).post('/api/imports/manuel').set(auth(jeton)).send(corps);
  const produits = [
    { reference: 'CFLR9YAT30035800002T', lot: '202614133', quantite: 6 },
    { reference: 'w0714', lot: '202613001', quantite: 3 },
    { reference: 'PI4V 3510 52K03', lot: '202615001', quantite: 2, longueur: 40, largeur: 30, hauteur: 20, poids: 5 },
  ];

  test("réservé à l'administrateur", async () => {
    expect((await manuel(chef, { numero: 'TEST-1', produits })).status).toBe(403);
  });
  test('référence inconnue du catalogue, connecteur sans dimensions : refusés, rien créé', async () => {
    const r1 = await manuel(admin, { numero: 'TEST-1', produits: [{ reference: 'XYZ999', lot: '1', quantite: 1 }] });
    expect(r1.status).toBe(400);
    expect(r1.body.message).toMatch(/XYZ999/);
    const r2 = await manuel(admin, { numero: 'TEST-1', produits: [{ reference: 'PI4V 3510 52K03', lot: '1', quantite: 1 }] });
    expect(r2.body.message).toMatch(/dimensions/);
    expect((await db.query("SELECT COUNT(*) AS n FROM italie_imports WHERE numero = 'TEST-1'"))[0][0].n).toBe(0);
  });
  test('créé tout de suite, en attente, type trouvé dans le catalogue', async () => {
    const r = await manuel(admin, { numero: 'test-1', produits });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ numero: 'TEST-1', produits: 4 }); // 1 bobine + 1 cosse + 2 cartons
    const [[imp]] = await db.query('SELECT statut, reception, numero_livraison FROM imports WHERE id = ?', [r.body.id]);
    expect(imp).toEqual({ statut: 'en_attente', reception: 'non_commencee', numero_livraison: 'TEST-1' });
    const [lignes] = await db.query('SELECT type, taille_bobine, reference, quantite FROM receptions WHERE import_id = ? ORDER BY id', [r.body.id]);
    expect(lignes.map((l) => [l.type, l.taille_bobine, l.reference, l.quantite])).toEqual([
      ['bobine', 'petite', 'CFLR9YAT30035800002T', 6],
      ['cosse', null, 'W0714', 3],
      ['connecteur', null, 'PI4V 3510 52K03', 1],
      ['connecteur', null, 'PI4V 3510 52K03', 1],
    ]);
  });
  test('n° de livraison déjà utilisé : refusé', async () => {
    expect((await manuel(admin, { numero: 'TEST-1', produits })).status).toBe(409);
  });
});

describe('rôle planificateur : uniquement la gestion des articles', () => {
  let planif;
  beforeAll(async () => {
    const hash = await bcrypt.hash('test1234', 4);
    await db.query(`INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES (61, '7001', 'Plan', 'Test', ?, 'planificateur')`, [hash]);
    planif = (await request(app).post('/api/auth/login').send({ matricule: '7001', motDePasse: 'test1234' })).body.token;
  });
  afterAll(async () => {
    await db.query('DELETE FROM articles_mp');
  });

  test('gère le catalogue des articles', async () => {
    const r = await request(app).post('/api/articles').set(auth(planif)).send({ reference: 'P0001', famille: 'cosse' });
    expect(r.status).toBe(201);
    expect((await request(app).get('/api/articles/resume').set(auth(planif))).status).toBe(200);
    expect((await request(app).delete(`/api/articles/${r.body.id}`).set(auth(planif))).status).toBe(204);
  });

  test('aucun accès au magasin, au mobile ni à l’administration', async () => {
    const refus = [
      ['get', '/api/stock'], ['get', '/api/imports'], ['post', '/api/imports/synchroniser'], ['get', '/api/exports'],
      ['get', '/api/reclamations'], ['get', '/api/mobile/receptions'], ['post', '/api/mobile/reception'],
      ['get', '/api/tableau-de-bord'], ['get', '/api/journal'], ['get', '/api/utilisateurs'], ['post', '/api/imports/manuel'],
    ];
    for (const [methode, url] of refus) {
      const r = await request(app)[methode](url).set(auth(planif)).send({});
      expect([url, r.status]).toEqual([url, 403]);
    }
    const r = await request(app).get('/api/stock').set(auth(planif));
    expect(r.body.message).toMatch(/uniquement à la gestion des articles/);
  });
});

test('ajouter, rechercher, résumer, modifier, supprimer', async () => {
  const ajout = (corps) => request(app).post('/api/articles').set(auth(admin)).send(corps);
  const b = await ajout({ reference: 'CFLR9YAT30035800002T', famille: 'bobine' });
  expect(b.status).toBe(201);
  expect((await ajout({ reference: 'W0714', famille: 'cosse' })).status).toBe(201);
  expect((await ajout({ reference: 'GCOR 4,5T3 A125 L.110 DELFINGEN', famille: 'connecteur', categorie: 'gcor' })).body.categorie).toBe('GCOR');
  expect((await ajout({ reference: 'cflr9yat30035800002t', famille: 'bobine' })).status).toBe(409); // doublon

  const tout = await request(app).get('/api/articles').set(auth(admin));
  expect(tout.body.map((a) => a.reference)).toEqual(['CFLR9YAT30035800002T', 'W0714', 'GCOR 4,5T3 A125 L.110 DELFINGEN']);
  const cherche = await request(app).get('/api/articles?q=4,5T3').set(auth(admin));
  expect(cherche.body).toHaveLength(1);
  const resume = await request(app).get('/api/articles/resume').set(auth(admin));
  expect(resume.body).toEqual([
    { famille: 'bobine', categorie: 'BOBINE', n: 1 },
    { famille: 'cosse', categorie: 'COSSE', n: 1 },
    { famille: 'connecteur', categorie: 'GCOR', n: 1 },
  ]);

  const m = await request(app).put(`/api/articles/${b.body.id}`).set(auth(admin)).send({ reference: 'CFLR9YAT30035800003T', famille: 'bobine' });
  expect(m.body.reference).toBe('CFLR9YAT30035800003T');
  expect((await request(app).delete(`/api/articles/${b.body.id}`).set(auth(admin))).status).toBe(204);
  expect((await request(app).get('/api/articles?famille=bobine').set(auth(admin))).body).toEqual([]);
});

test('taille d’une bobine changée depuis Articles : gardée dans l’historique', async () => {
  const b = await request(app).post('/api/articles').set(auth(admin)).send({ reference: 'CFHLR2GBT50400450000T', famille: 'bobine', bobines_par_palette: 2 });
  expect(b.status).toBe(201);
  expect(b.body.bobines_par_palette).toBe(2);
  const taille = (n) => request(app).put(`/api/articles/${b.body.id}/taille`).set(auth(admin)).send({ bobines_par_palette: n });
  expect((await taille(4)).status).toBe(400);
  const r = await taille(6);
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ bobines_par_palette: 6, avant: 2, change: true });
  expect((await taille(6)).body.change).toBe(false); // même taille : rien de noté
  // modification par le formulaire : notée aussi
  await request(app).put(`/api/articles/${b.body.id}`).set(auth(admin)).send({ reference: 'CFHLR2GBT50400450000T', famille: 'bobine', bobines_par_palette: 1 });
  const h = await request(app).get('/api/articles/changements-taille?reference=cfhlr2gbt50400450000t').set(auth(admin));
  expect(h.body.map((x) => [x.avant, x.apres])).toEqual([[6, 1], [2, 6]]);
  expect(h.body[0]).toMatchObject({ reference: 'CFHLR2GBT50400450000T', matricule: expect.any(String) });
  const cosse = await request(app).post('/api/articles').set(auth(admin)).send({ reference: 'F0391', famille: 'cosse' });
  expect((await request(app).put(`/api/articles/${cosse.body.id}/taille`).set(auth(admin)).send({ bobines_par_palette: 2 })).status).toBe(400);
});

test('type d’une cosse changé depuis Articles : gardé dans l’historique', async () => {
  const c = await request(app).post('/api/articles').set(auth(admin)).send({ reference: 'F0253', famille: 'cosse', type_cosse: 'plat' });
  expect(c.body.type_cosse).toBe('plat');
  const type = (t) => request(app).put(`/api/articles/${c.body.id}/type-cosse`).set(auth(admin)).send({ type_cosse: t });
  expect((await type('ronde')).status).toBe(400);
  expect((await type('axiale')).body).toMatchObject({ type_cosse: 'axiale', avant: 'plat', change: true });
  expect((await type('axiale')).body.change).toBe(false);
  await request(app).put(`/api/articles/${c.body.id}`).set(auth(admin)).send({ reference: 'F0253', famille: 'cosse', type_cosse: 'plat' });
  const h = (await request(app).get('/api/articles/changements-taille?reference=F0253').set(auth(admin))).body;
  expect(h.map((x) => [x.famille, x.type_cosse_avant, x.type_cosse_apres])).toEqual([['cosse', 'axiale', 'plat'], ['cosse', 'plat', 'axiale']]);
  const bobine = await request(app).post('/api/articles').set(auth(admin)).send({ reference: 'CAV X1', famille: 'bobine' });
  expect((await request(app).put(`/api/articles/${bobine.body.id}/type-cosse`).set(auth(admin)).send({ type_cosse: 'plat' })).status).toBe(400);
});
