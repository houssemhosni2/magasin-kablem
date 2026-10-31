// « Ranger le magasin » sans suggestion : déplacements libres scannés sur le mobile,
// contrôlés (règles du magasin) et historisés avec le matricule, sur la base de test.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');
const viderBase = require('./vider-base');

const jetons = {};
const auth = (qui) => ({ Authorization: `Bearer ${jetons[qui]}` });
const uuid = () => crypto.randomUUID();
const produit = (qr, qui = 'ali') => request(app).get('/api/mobile/ranger/produit').query({ qr }).set(auth(qui));
const deplacer = (qr, depuis, vers, qui = 'ali', id = uuid()) =>
  request(app).post('/api/mobile/ranger/deplacer').set(auth(qui)).send({ uuid: id, qr, depuis, vers });
const palette = (depuis, vers, qui = 'ali') => request(app).post('/api/mobile/ranger/palette').set(auth(qui)).send({ uuid: uuid(), depuis, vers });
const contenu = async (code) =>
  (await db.query('SELECT r.reference, SUM(p.quantite) AS q FROM placements p JOIN receptions r ON r.id = p.reception_id WHERE p.emplacement = ? GROUP BY r.reference ORDER BY r.reference', [code]))[0]
    .map((x) => `${x.reference}×${x.q}`);
const ticket = (ref, lot, colis) => `${ref};17000;${colis};${lot};1`;
const PA = (n) => ticket('PA101', '202600001', n);
const PC = (n) => ticket('PC303', '202600006', n);

beforeAll(async () => {
  await viderBase();
  await db.query("INSERT INTO parametres (cle, valeur) VALUES ('tampon_capacite', '3') ON DUPLICATE KEY UPDATE valeur = '3'");
  const hash = await bcrypt.hash('test1234', 4);
  await db.query(`INSERT INTO utilisateurs (id, matricule, nom, prenom, mot_de_passe, role) VALUES
    (81, '9101', 'Ben Ali', 'Ali', ?, 'magasinier'), (82, '9102', 'Trabelsi', 'Sami', ?, 'magasinier'),
    (83, '9103', 'Chef', 'Mona', ?, 'chef_magasin'), (84, '9104', 'Plan', 'Nour', ?, 'planificateur')`, [hash, hash, hash, hash]);
  await db.query(`INSERT INTO imports (id, statut, numero_livraison, date_creation) VALUES (70, 'ajoute', 'LIV-70', NOW() - INTERVAL 5 DAY)`);
  await db.query(`INSERT INTO receptions (id, import_id, type, taille_bobine, reference, lot, quantite) VALUES
    (701, 70, 'bobine', 'petite', 'PA101', '202600001', 5),
    (702, 70, 'bobine', 'petite', 'PB202', '202600002', 1),
    (703, 70, 'bobine', 'grande', 'GA101', '202600003', 1),
    (704, 70, 'bobine', 'grande', 'GB202', '202600004', 1),
    (705, 70, 'cosse', NULL, 'K0001', '202600005', 3),
    (706, 70, 'bobine', 'petite', 'PC303', '202600006', 4),
    (708, 70, 'bobine', 'grande', 'GR001', '202600008', 1)`);
  // D003 : 4 PA101 · D009 : 1 PA101 · D015 : 1 PB202 · T01 : 1 grande GA101 · D000 : 1 grande GB202 · D100 : 3 cosses K0001
  // PC303 reçue colis par colis : colis 1 et 2 en D020, colis 3 et 4 en D021 · D002 réservé à GR001 (pas encore rangée)
  await db.query(`INSERT INTO placements (reception_id, emplacement, quantite) VALUES
    (701, 'D003', 4), (701, 'D009', 1), (702, 'D015', 1), (703, 'T01', 1), (704, 'D000', 1), (705, 'D100', 3), (706, 'D020', 2), (706, 'D021', 2)`);
  await db.query(`INSERT INTO affectations_colis (reception_id, ticket, colis, emplacement, range_le) VALUES
    (706, 'PC303|202600006-1|1', 1, 'D020', NOW()), (706, 'PC303|202600006-1|2', 2, 'D020', NOW()),
    (706, 'PC303|202600006-1|3', 3, 'D021', NOW()), (706, 'PC303|202600006-1|4', 4, 'D021', NOW())`);
  await db.query(`INSERT INTO plans_rangement (reception_id, emplacement, quantite, ranges) VALUES (708, 'D002', 1, 0)`);
  const login = async (m) => (await request(app).post('/api/auth/login').send({ matricule: m, motDePasse: 'test1234' })).body.token;
  [jetons.ali, jetons.sami, jetons.chef, jetons.planif] = await Promise.all(['9101', '9102', '9103', '9104'].map(login));
});

afterAll(async () => {
  await db.query("DELETE FROM parametres WHERE cle = 'tampon_capacite'");
  await db.end();
});

describe('avant de déplacer : où est le produit, que contient un emplacement', () => {
  test('produit : ses emplacements ; colis suivi : sa place exacte', async () => {
    const r = await produit(PA(5));
    expect(r.body).toMatchObject({ reference: 'PA101', type: 'bobine', taille_bobine: 'petite', colis: 5, ici: null });
    expect(r.body.emplacements).toEqual([{ code: 'D003', quantite: 4 }, { code: 'D009', quantite: 1 }]);
    expect((await produit(PC(3))).body.ici).toBe('D021');
    expect((await produit(ticket('ZZ999', '202600099', 1))).status).toBe(404);
    expect((await produit('bonjour')).status).toBe(400);
  });
  test('emplacement : contenu et remplissage', async () => {
    const e = (code) => request(app).get(`/api/mobile/ranger/emplacement/${code}`).set(auth('ali'));
    expect((await e('D003')).body.remplissage).toEqual({ n: 4, capacite: 6, libelle: '4/6 petites bobines' });
    expect((await e('D100')).body.remplissage.libelle).toBe('3/10 cosses plates');
    expect((await e('D004')).body.remplissage.libelle).toBe('vide');
    expect((await e('Z999')).status).toBe(404);
  });
});

describe('contrôles : un déplacement interdit est refusé, noté, et rien ne bouge', () => {
  const refuse = async (r, message) => {
    expect(r.body).toMatchObject({ controle: 'ranger', couleur: 'rouge' });
    expect(r.body.message).toMatch(message);
  };
  test('ticket illisible, emplacement inconnu, départ = arrivée', async () => {
    expect((await deplacer('bonjour', 'D009', 'D003')).body.resultat).toBe('ticket_illisible');
    expect((await deplacer(PA(5), 'D009', 'Z999')).body.resultat).toBe('emplacement_inconnu');
    await refuse(await deplacer(PA(5), 'D009', 'D009'), /identiques/);
  });
  test('le produit n’est pas à l’emplacement de départ', async () => {
    await refuse(await deplacer(ticket('PB202', '202600002', 1), 'D009', 'D003'), /PB202 lot 202600002 n'est pas en D009/);
  });
  test('mauvais niveau, autre taille', async () => {
    await refuse(await deplacer(PA(5), 'D009', 'D101'), /se range au niveau 0, pas en D101/);
    await refuse(await deplacer(PA(5), 'D009', 'D000'), /impossible d'y mettre PA101/);
  });
  test('colis suivi : il ne part que de la place où il est posé', async () => {
    await refuse(await deplacer(PC(3), 'D020', 'D003'), /colis n° 3 est en D021, pas en D020/);
  });
  test('tout est noté au journal avec le matricule ; le stock n’a pas bougé', async () => {
    const [refus] = await db.query("SELECT resultat, utilisateur_id FROM controles_mobile WHERE controle = 'ranger'");
    expect(refus).toHaveLength(7);
    expect(refus.every((c) => c.utilisateur_id === 81 && c.resultat !== 'deplace')).toBe(true);
    expect(await contenu('D009')).toEqual(['PA101×1']);
    expect(await contenu('D003')).toEqual(['PA101×4']);
    expect((await db.query("SELECT COUNT(*) AS n FROM mouvements_emplacement"))[0][0].n).toBe(0);
  });
});

describe('déplacements acceptés : stock, historique et journal', () => {
  test('un produit : D009 → D003, D009 libéré, historique complet', async () => {
    const id = uuid();
    const r = await deplacer(PA(5), 'D009', 'D003', 'ali', id);
    expect(r.body).toMatchObject({ controle: 'ranger', resultat: 'deplace', couleur: 'vert' });
    expect(r.body.deplacement).toMatchObject({ depuis: 'D009', vers: 'D003', depuis_libre: true, vers_remplissage: { libelle: '5/6 petites bobines' } });
    expect(r.body.message).toMatch(/D009 → D003\. D009 est libre/);
    expect(await contenu('D009')).toEqual([]);
    expect(await contenu('D003')).toEqual(['PA101×5']);
    const [[m]] = await db.query("SELECT origine, motif, reference, lot, type, taille_bobine, quantite, colis, depuis, vers, depuis_liberee, utilisateur_id FROM mouvements_emplacement");
    expect(m).toEqual({
      origine: 'regroupement', motif: 'regroupement', reference: 'PA101', lot: '202600001', type: 'bobine', taille_bobine: 'petite',
      quantite: 1, colis: 5, depuis: 'D009', vers: 'D003', depuis_liberee: 1, utilisateur_id: 81,
    });
    // Le même envoi rejoué (réseau) : pas de 2e déplacement
    expect((await deplacer(PA(5), 'D009', 'D003', 'ali', id)).body).toMatchObject({ resultat: 'deplace', rejoue: true });
    expect(await contenu('D003')).toEqual(['PA101×5']);
  });
  test('références mélangées sur une palette : accepté, jusqu’à la capacité', async () => {
    expect((await deplacer(ticket('PB202', '202600002', 1), 'D015', 'D003')).body.deplacement.vers_remplissage.libelle).toBe('6/6 petites bobines');
    const plein = await deplacer(PC(1), 'D020', 'D003');
    expect(plein.body.resultat).toBe('deplacement_refuse');
    expect(plein.body.message).toMatch(/D003 est plein : une palette contient au maximum 6 petites bobines/);
  });
  test('colis suivi : sa place suit le déplacement', async () => {
    const r = await deplacer(PC(1), 'D020', 'D021', 'sami');
    expect(r.body).toMatchObject({ resultat: 'deplace', deplacement: { depuis_libre: false, depuis_remplissage: { libelle: '1/6 petites bobines' } } });
    expect((await db.query("SELECT emplacement FROM affectations_colis WHERE ticket = 'PC303|202600006-1|1'"))[0][0].emplacement).toBe('D021');
    expect((await deplacer(PC(1), 'D020', 'D021', 'sami')).body.message).toMatch(/colis n° 1 est en D021, pas en D020/);
  });
  test('cosses : un autre emplacement des niveaux 1 et 2', async () => {
    expect((await deplacer(ticket('K0001', '202600005', 1), 'D100', 'D200', 'sami')).body.resultat).toBe('deplace');
    expect(await contenu('D200')).toEqual(['K0001×1']);
  });
});

describe('toute la palette d’un emplacement', () => {
  test('arrivée occupée, réservée ou au mauvais niveau : refusé', async () => {
    expect((await palette('T01', 'D000')).body.message).toMatch(/D000 n'est pas vide \(1\/1 grande bobine\)/);
    expect((await palette('T01', 'D002')).body.message).toMatch(/D002 n'est pas vide \(réservé pour un import\)/);
    expect((await palette('T01', 'D101')).body.message).toMatch(/se range au niveau 0/);
    expect((await palette('D004', 'D005')).body.message).toMatch(/D004 est vide/);
    expect(await contenu('T01')).toEqual(['GA101×1']);
  });
  test('posée sur un emplacement vide : tout suit, le départ est libéré', async () => {
    const r = await palette('T01', 'D001');
    expect(r.body).toMatchObject({ resultat: 'deplace', deplacement: { palette: true, depuis_libre: true, vers_remplissage: { libelle: '1/1 grande bobine' } } });
    expect(await contenu('T01')).toEqual([]);
    expect(await contenu('D001')).toEqual(['GA101×1']);
    const [[m]] = await db.query("SELECT commentaire, depuis_liberee FROM mouvements_emplacement WHERE depuis = 'T01'");
    expect(m).toEqual({ commentaire: 'Palette entière', depuis_liberee: 1 });
  });
});

describe('suivi', () => {
  test('mobile : mes déplacements du jour', async () => {
    const r = (await request(app).get('/api/mobile/ranger/mes-deplacements').set(auth('ali'))).body;
    expect(r).toMatchObject({ deplacements: 3, produits: 3, liberes: 3 });
    expect(r.refus).toBeGreaterThanOrEqual(8);
    expect(r.mouvements.map((m) => `${m.depuis}→${m.vers}`)).toEqual(['T01→D001', 'D015→D003', 'D009→D003']);
  });
  test('web : chiffres, travail de chaque personne, refus, filtres', async () => {
    const r = (await request(app).get('/api/ranger').set(auth('chef'))).body;
    expect(r.resume).toMatchObject({ deplacements: 5, produits: 5, liberes: 3, personnes: 2 });
    expect(r.par_personne.map((p) => [p.matricule, p.deplacements, p.liberes])).toEqual([['9101', 3, 3], ['9102', 2, 0]]);
    expect(r.mouvements[0]).toMatchObject({ reference: 'GA101', depuis: 'T01', vers: 'D001', matricule: '9101', nom: 'Ben Ali', prenom: 'Ali' });
    expect(r.mouvements.find((m) => m.reference === 'K0001')).toMatchObject({ depuis: 'D100', vers: 'D200', matricule: '9102', nom: 'Trabelsi' });
    expect(r.refus.some((x) => /n'est pas en D009/.test(x.message) && x.matricule === '9101' && x.depuis === 'D009' && x.vers === 'D003')).toBe(true);
    expect(r.utilisateurs.map((u) => u.matricule)).toEqual(['9101', '9102']);
    const sami = (await request(app).get('/api/ranger').query({ par: '9102' }).set(auth('chef'))).body;
    expect(sami.mouvements.every((m) => m.matricule === '9102')).toBe(true);
    expect(sami.resume.deplacements).toBe(2);
    const d021 = (await request(app).get('/api/ranger').query({ emplacement: 'd021' }).set(auth('chef'))).body;
    expect(d021.mouvements.map((m) => m.reference)).toEqual(['PC303']);
  });
  test('historique des emplacements : filtre par matricule, n° de colis', async () => {
    const r = (await request(app).get('/api/stock/historique').query({ origine: 'regroupement', par: '9101' }).set(auth('chef'))).body;
    expect(r).toHaveLength(3);
    expect(r.find((m) => m.depuis === 'D009')).toMatchObject({ colis: 5, depuis_liberee: true, par: '9101', nom: 'Ben Ali' });
  });
  test('journal des alertes : les déplacements refusés y figurent', async () => {
    const r = (await request(app).get('/api/journal').query({ controle: 'ranger' }).set(auth('chef'))).body;
    const ligne = (r.lignes ?? r).find((l) => l.resultat === 'deplacement_refuse');
    expect(ligne).toMatchObject({ controle_libelle: 'Ranger le magasin', titre: 'Déplacement refusé', couleur: 'rouge' });
  });
  test('rôles : le planificateur ne range pas et ne voit pas le suivi', async () => {
    expect((await deplacer(PA(1), 'D003', 'D004', 'planif')).status).toBe(403);
    expect((await request(app).get('/api/ranger').set(auth('planif'))).status).toBe(403);
  });
});
