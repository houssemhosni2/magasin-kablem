const { lireTicket, lireEmplacement } = require('../src/ticket');

describe('lecture du QR du ticket vert', () => {
  test('valeurs séparées par ;', () => {
    expect(lireTicket('F0411;202613252;3')).toMatchObject({ reference: 'F0411', lot: '202613252', quantite: 3, cle: null });
  });
  test('clé : valeur (italien)', () => {
    expect(lireTicket('CODICE: f0411 | LOTTO: 202613252 | QTA: 2 300')).toMatchObject({ reference: 'F0411', lot: '202613252', quantite: 2300 });
  });
  test('JSON', () => {
    expect(lireTicket('{"reference":"C2810","lotto":"202613002","qta":6}')).toMatchObject({ reference: 'C2810', lot: '202613002', quantite: 6 });
  });
  test('QR incomplet ou vide', () => {
    expect(lireTicket('F0411;202613252')).toBeNull();
    expect(lireTicket('')).toBeNull();
    expect(lireTicket('F0411;202613252;-2')).toBeNull();
  });
});

describe('ticket vert réel du fournisseur (un ticket = un colis)', () => {
  const { messageIllisible, memeLot } = require('../src/ticket');
  test('ticket Coficab à référence longue : CFLR9YAT30035800002T;11548;6;202614133;3', () => {
    const t = lireTicket('CFLR9YAT30035800002T;11548;6;202614133;3');
    expect(t).toMatchObject({ reference: 'CFLR9YAT30035800002T', lot: '202614133', suffixe: '3', colis: 6, confection: 11548, quantite: 1 });
    expect(t.cle).toBe('CFLR9YAT30035800002T|202614133-3|6');
  });

  test('F0391;13000;10;202613167;1', () => {
    expect(lireTicket('F0391;13000;10;202613167;1')).toEqual({
      reference: 'F0391', lot: '202613167', quantite: 1, colis: 10, confection: 13000, suffixe: '1', cle: 'F0391|202613167-1|10',
    });
  });
  test('le lot de la base peut être écrit avec ou sans suffixe', () => {
    const t = lireTicket('F0391;13000;10;202613167;1');
    expect(memeLot('202613167', t)).toBe(true);
    expect(memeLot('202613167-1', t)).toBe(true);
    expect(memeLot('202613168', t)).toBe(false);
  });
  test('QR « Codice Articolo » (référence seule) : message clair', () => {
    expect(lireTicket('F0391')).toBeNull();
    expect(messageIllisible('F0391')).toMatch(/QR du bas/);
  });
});

describe("lecture du QR d'un emplacement", () => {
  test.each([
    ['D011', 'D011'],
    ['empl:d011', 'D011'],
    ['EMPLACEMENT=A105', 'A105'],
    ['{"emplacement":"T05"}', 'T05'],
    ['https://192.168.100.42:8100/e/D011', 'D011'],
    ['https://magasin.kablem.tn/e/a000/', 'A000'],
    ['https://magasin.kablem.tn/e/T12?x=1', 'T12'],
  ])('%s -> %s', (texte, code) => expect(lireEmplacement(texte)).toBe(code));
  test('texte qui n’est pas un emplacement', () => {
    expect(lireEmplacement('F0411;202613252;3')).toBeNull();
  });
});
