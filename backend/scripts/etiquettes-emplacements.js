// Étiquettes QR des emplacements du magasin (à imprimer et coller sur les rayonnages).
// Une page par bloc / niveau / façade (11 étiquettes), puis la zone tampon.
// Le QR contient seulement le code de l'emplacement (ex. « B100 »), comme le ticket vert contient ses
// données : n'importe quel lecteur de QR affiche « B100 », et l'application le reconnaît au scan.
// Usage : node scripts/etiquettes-emplacements.js [fichier.pdf]
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const mysql = require('mysql2/promise');

const options = process.argv.slice(2);
const SORTIE = options.find((o) => !o.startsWith('--')) || path.join(__dirname, '..', '..', 'docs', 'Etiquettes-QR-emplacements.pdf');
const contenuQr = (code) => code; // le code seul, sans préfixe ni adresse
const LOGO = path.join(__dirname, '..', '..', 'frontend', 'public', 'logo-kablem.png');

// Même plan que l'application (backend/src/rangement.js) : A une façade (00-10), B, C, D deux façades (00-21)
const BLOCS = { A: 1, B: 2, C: 2, D: 2 };
const NIVEAUX = [0, 1, 2, 3, 4];
const USAGE = { 0: 'Bobines', 1: 'Cosses', 2: 'Cosses', 3: 'Connecteurs', 4: 'Connecteurs' };

const JAUNE = '#FFD21F';
const NUIT = '#06163A';
const ROUGE = '#E02222';
const GRIS = '#5A6276';

async function capaciteTampon() {
  try {
    const c = await mysql.createConnection({
      host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
      password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'magasin_kablem',
    });
    const [[l]] = await c.query("SELECT valeur FROM parametres WHERE cle = 'tampon_capacite'");
    await c.end();
    return Number(l?.valeur) || 20;
  } catch {
    return 20;
  }
}

function groupes(nbTampon) {
  const liste = [];
  for (const [bloc, nbFacades] of Object.entries(BLOCS)) {
    for (const niveau of NIVEAUX) {
      for (let facade = 1; facade <= nbFacades; facade++) {
        const debut = facade === 1 ? 0 : 11;
        const codes = Array.from({ length: 11 }, (_, k) => `${bloc}${niveau}${String(debut + k).padStart(2, '0')}`);
        liste.push({
          titre: `Bloc ${bloc} · Niveau ${niveau}`,
          sousTitre: `${nbFacades === 1 ? 'Une seule façade (mur)' : 'Façade ' + facade} · ${codes[0]} à ${codes[10]} · ${USAGE[niveau]}`,
          etiquettes: codes.map((code) => ({
            code,
            detail: `Bloc ${bloc} · Niveau ${niveau}${nbFacades === 1 ? '' : ' · Façade ' + facade}`,
            usage: USAGE[niveau],
          })),
        });
      }
    }
  }
  // Zone tampon : 12 étiquettes par page
  const tampon = Array.from({ length: nbTampon }, (_, k) => `T${String(k + 1).padStart(2, '0')}`);
  for (let i = 0; i < tampon.length; i += 12) {
    const codes = tampon.slice(i, i + 12);
    liste.push({
      titre: 'Zone tampon',
      sousTitre: `Au sol, devant les blocs A et B · ${codes[0]} à ${codes[codes.length - 1]}`,
      etiquettes: codes.map((code) => ({ code, detail: 'Zone tampon (au sol)', usage: 'Attente de rangement' })),
    });
  }
  return liste;
}

async function main() {
  const nbTampon = await capaciteTampon();
  const pages = groupes(nbTampon);
  const total = pages.reduce((t, p) => t + p.etiquettes.length, 0);
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Étiquettes QR des emplacements', Author: 'Kab-lem Tunisia' } });
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  doc.pipe(fs.createWriteStream(SORTIE));

  const L = doc.page.width; // 595
  const H = doc.page.height; // 842
  const marge = 28;
  const colonnes = 3;
  const lignes = 4;
  const ecart = 10;
  const haut = 92; // en-tête de page
  const largeur = (L - 2 * marge - (colonnes - 1) * ecart) / colonnes;
  const hauteur = (H - haut - marge - 22 - (lignes - 1) * ecart) / lignes;

  // ---------- Page de garde ----------
  doc.rect(0, 0, L, H).fill('#ffffff');
  doc.rect(0, 0, L, 300).fill(NUIT);
  doc.rect(0, 300, L, 8).fill(ROUGE);
  if (fs.existsSync(LOGO)) {
    doc.roundedRect(L / 2 - 110, 70, 220, 84, 14).fill('#ffffff');
    doc.image(LOGO, L / 2 - 90, 84, { fit: [180, 56], align: 'center', valign: 'center' });
  }
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(30).text('Étiquettes QR', 0, 190, { width: L, align: 'center' });
  doc.fillColor('#c7d0ec').font('Helvetica').fontSize(15).text('Emplacements du magasin', 0, 232, { width: L, align: 'center' });
  const resume = [
    ['Emplacements de rayonnage', `${total - nbTampon}`],
    ['Places de la zone tampon', `${nbTampon}`],
    ['Blocs', 'A (une façade), B, C, D (deux façades)'],
    ['Niveaux', '0 bobines · 1-2 cosses · 3-4 connecteurs'],
  ];
  let y = 350;
  for (const [t, v] of resume) {
    doc.fillColor(GRIS).font('Helvetica').fontSize(12).text(t, 70, y);
    doc.fillColor(NUIT).font('Helvetica-Bold').fontSize(12).text(v, 260, y, { width: L - 330 });
    y += 30;
  }
  doc.roundedRect(60, y + 20, L - 120, 200, 12).fill('#f4f6fa');
  doc.fillColor(NUIT).font('Helvetica-Bold').fontSize(13).text('Mode d\'emploi', 80, y + 38);
  doc.fillColor('#14193a').font('Helvetica').fontSize(11.5).text(
    '1. Imprimer en couleur, à 100 % (sans « ajuster à la page »), de préférence sur papier adhésif.\n' +
      '2. Découper le long des pointillés.\n' +
      '3. Coller chaque étiquette sur la traverse de son emplacement, QR bien à plat et visible.\n' +
      '4. Application mobile : Rangement ou Export, scanner l\'étiquette de l\'emplacement, puis le ticket du produit.\n\n' +
      'Le QR contient seulement le code de l\'emplacement (ex. B100).',
    80, y + 62, { width: L - 160, lineGap: 3 }
  );
  doc.fillColor(GRIS).font('Helvetica').fontSize(10).text('Kab-lem Tunisia · Menzel Jemil', 0, H - 40, { width: L, align: 'center' });

  // ---------- Une page par groupe ----------
  let numero = 1;
  for (const page of pages) {
    doc.addPage({ size: 'A4', margin: 0 });
    numero++;
    doc.rect(0, 0, L, 62).fill(NUIT);
    doc.rect(0, 62, L, 4).fill(ROUGE);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(page.titre, marge, 18);
    doc.fillColor('#c7d0ec').font('Helvetica').fontSize(10.5).text(page.sousTitre, marge, 42);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text('KAB-LEM · MAGASIN', L - marge - 160, 25, { width: 160, align: 'right' });

    for (let k = 0; k < page.etiquettes.length; k++) {
      const e = page.etiquettes[k];
      const x = marge + (k % colonnes) * (largeur + ecart);
      const yy = haut + Math.floor(k / colonnes) * (hauteur + ecart);

      // Pointillés de découpe
      doc.save().lineWidth(0.6).dash(3, { space: 3 }).strokeColor('#9aa3b5').rect(x - 3, yy - 3, largeur + 6, hauteur + 6).stroke().restore();

      // Étiquette : fond jaune, bande noire à gauche (comme dans l'application)
      doc.roundedRect(x, yy, largeur, hauteur, 8).fill(JAUNE);
      doc.rect(x, yy, 9, hauteur).fill('#111111');

      // Code en très grand
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(40).text(e.code, x + 9, yy + 10, { width: largeur - 9, align: 'center' });

      // QR sur fond blanc (zone de silence comprise)
      const cote = Math.min(largeur - 46, hauteur - 104);
      const qx = x + 9 + (largeur - 9 - cote) / 2;
      const qy = yy + 60;
      const png = await QRCode.toBuffer(contenuQr(e.code), { errorCorrectionLevel: 'M', margin: 1, scale: 8, color: { dark: '#000000', light: '#ffffff' } });
      doc.roundedRect(qx - 6, qy - 6, cote + 12, cote + 12, 6).fill('#ffffff');
      doc.image(png, qx, qy, { width: cote, height: cote });

      // Détail
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(9).text(e.usage.toUpperCase(), x + 9, yy + hauteur - 30, { width: largeur - 9, align: 'center' });
      doc.fillColor('#333333').font('Helvetica').fontSize(8).text(e.detail, x + 9, yy + hauteur - 17, { width: largeur - 9, align: 'center' });
    }
    doc.fillColor(GRIS).font('Helvetica').fontSize(8).text(`Étiquettes QR des emplacements · page ${numero}`, 0, H - 20, { width: L, align: 'center', lineBreak: false });
  }

  doc.end();
  await new Promise((r) => doc.on('end', r));
  console.log(`Contenu des QR : ${contenuQr('B100')} (le code seul)`);
  console.log(`${total} étiquettes (${total - nbTampon} emplacements + ${nbTampon} places tampon) -> ${SORTIE}`);
}

main().catch((e) => {
  console.error('ERREUR :', e.message);
  process.exitCode = 1;
});
