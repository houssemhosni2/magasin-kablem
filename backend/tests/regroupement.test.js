// Calcul des propositions de regroupement (src/regroupement.js). L'application ne l'appelle plus depuis
// le 2026-10-29 (les magasiniers rangent sans suggestion) ; il est gardé pour la discussion du rangement
// automatique avant chaque import. Test du calcul seul, sans base de données.
const R = require('../src/rangement');
const { proposerRegroupements } = require('../src/regroupement');

// Une ligne de stock posée à un emplacement
let id = 0;
const pose = (reference, lot, taille, quantite, emplacement) => ({
  id: ++id, reception_id: id, reference, lot, type: 'bobine', taille_bobine: taille, quantite, emplacement, date_reception: '2026-10-20T08:00:00',
});

test('palette du tampon vers un vide, puis palettes partielles vidées (le moins de bobines d’abord)', () => {
  // D003 : 4 petites PA101 · D009 : 1 petite PA101 · D015 : 1 petite PB202 · T01 : 1 grande GA101 · D000 : 1 grande GB202
  const occupation = [
    pose('PA101', '202600001', 'petite', 4, 'D003'),
    pose('PA101', '202600001', 'petite', 1, 'D009'),
    pose('PB202', '202600002', 'petite', 1, 'D015'),
    pose('GA101', '202600003', 'grande', 1, 'T01'),
    pose('GB202', '202600004', 'grande', 1, 'D000'),
  ];
  const propositions = proposerRegroupements(occupation, { capaciteTampon: 5, limites: R.LIMITES_CONNECTEUR_DEFAUT });
  expect(propositions[0]).toMatchObject({ id: 'palette-T01', sorte: 'palette', gestes: 1 });
  expect(propositions[0].vers).toMatch(/^[A-D]0\d\d$/);
  // D009 (1 PA101) et D015 (1 PB202) se vident dans D003 (4/6) : 2 emplacements libérés, 2 bobines portées
  const regroupements = propositions.filter((p) => p.sorte === 'regroupement');
  expect(regroupements.map((p) => p.depuis).sort()).toEqual(['D009', 'D015']);
  expect(regroupements.every((p) => p.nb_bobines === 1 && p.etapes[0].vers === 'D003')).toBe(true);
});
