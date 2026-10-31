// Plan du magasin : 4 blocs (A, B, C, D), 5 niveaux (0 = sol … 4 = haut).
// - Bloc A : une seule façade (contre le mur de droite) ; blocs B, C, D : deux façades.
// - Code = lettre du bloc + niveau + numéro sur 2 chiffres (ex. C215).
// - 1 emplacement = 1 palette.
//
// Numérotation (définie avec le magasinier, avant la pose des étiquettes) :
// la porte de sortie vers la production est dans le mur du fond, dans l'allée du bloc D.
// Le 00 est au plus près de la porte et les numéros augmentent en s'éloignant :
// - D façade 1 (allée de la porte) : 00 contre la porte → 10 au bout ouvert ;
//   D façade 2 (allée C-D) : 11 au bout ouvert → 21 contre le mur du fond (le plus loin).
// - C et B : façade 1 (côté D) 00 → 10 et façade 2 (côté A) 11 → 21, du bout ouvert vers le mur.
// - A : 00 → 10, du bout ouvert vers le mur.

export interface Emplacement {
  code: string;
  bloc: string;
  niveau: number;
  facade: 1 | 2;
  numero: number;
  position: number; // place dans le rayonnage : 0 = contre le mur du fond … 10 = bout ouvert
}

export interface Facade {
  id: string; // ex. "B-2"
  bloc: string;
  numero: 1 | 2;
  libelle: string;
  allee: string; // allée depuis laquelle on accède à la façade
  normale: 1 | -1; // +1 : la façade regarde vers le bloc D, -1 : vers le bloc A
  // Du niveau 4 (haut) au niveau 0 (sol), pour l'affichage vu de face
  niveaux: { niveau: number; emplacements: Emplacement[] }[];
}

export interface Bloc {
  lettre: string;
  contreMur: boolean;
  facades: Facade[];
}

export const NIVEAUX = [0, 1, 2, 3, 4];
export const EMPLACEMENTS_PAR_FACADE = 11;

const DEFINITION_BLOCS = [
  { lettre: 'A', nbFacades: 1 },
  { lettre: 'B', nbFacades: 2 },
  { lettre: 'C', nbFacades: 2 },
  { lettre: 'D', nbFacades: 2 },
];
const LETTRES = DEFINITION_BLOCS.map((b) => b.lettre);

export function codeEmplacement(bloc: string, niveau: number, numero: number): string {
  return `${bloc}${niveau}${String(numero).padStart(2, '0')}`;
}

// Numéro de l'emplacement situé à la position p (0 = mur du fond … 10 = bout ouvert)
function numeroA(bloc: string, facade: 1 | 2, p: number): number {
  if (facade === 2) return 21 - p; // 11 au bout ouvert → 21 contre le mur
  return bloc === 'D' ? p : 10 - p; // D : 00 contre la porte ; autres : 00 au bout ouvert
}

function construireFacade(bloc: string, numero: 1 | 2, nbFacades: number): Facade {
  const i = LETTRES.indexOf(bloc);
  // Façade 1 regarde vers le bloc suivant (côté D), façade 2 vers le bloc précédent (côté A)
  const normale: 1 | -1 = numero === 1 ? 1 : -1;
  const allee =
    numero === 1 ? (bloc === 'D' ? 'allée de la porte' : `allée ${bloc}-${LETTRES[i + 1]}`) : `allée ${LETTRES[i - 1]}-${bloc}`;
  return {
    id: `${bloc}-${numero}`,
    bloc,
    numero,
    libelle: nbFacades === 1 ? 'Façade unique' : `Façade ${numero}`,
    allee,
    normale,
    niveaux: [...NIVEAUX].reverse().map((niveau) => ({
      niveau,
      emplacements: Array.from({ length: EMPLACEMENTS_PAR_FACADE }, (_, p) => {
        const n = numeroA(bloc, numero, p);
        return { code: codeEmplacement(bloc, niveau, n), bloc, niveau, facade: numero, numero: n, position: p };
      }).sort((x, y) => x.numero - y.numero),
    })),
  };
}

export const BLOCS: Bloc[] = DEFINITION_BLOCS.map(({ lettre, nbFacades }) => ({
  lettre,
  contreMur: nbFacades === 1,
  facades: Array.from({ length: nbFacades }, (_, i) => construireFacade(lettre, (i + 1) as 1 | 2, nbFacades)),
}));

export const TOUS_LES_EMPLACEMENTS: Emplacement[] = BLOCS.flatMap((b) =>
  b.facades.flatMap((f) => f.niveaux.flatMap((n) => n.emplacements))
);

// Classement du magasin : niveaux réservés à chaque type de produit
export const NIVEAUX_PAR_TYPE: Record<'bobine' | 'cosse' | 'connecteur', number[]> = {
  bobine: [0],
  cosse: [1, 2],
  connecteur: [3, 4],
};

export const LIBELLE_NIVEAUX_TYPE: Record<'bobine' | 'cosse' | 'connecteur', string> = {
  bobine: 'niveau 0',
  cosse: 'niveaux 1 et 2',
  connecteur: 'niveaux 3 et 4',
};

// Type de produit rangé à un niveau donné
export function typeDuNiveau(niveau: number): 'bobine' | 'cosse' | 'connecteur' {
  return niveau === 0 ? 'bobine' : niveau <= 2 ? 'cosse' : 'connecteur';
}

// Capacité d'un emplacement (= 1 palette) : 1 grande bobine, 2 moyennes ou 6 petites ;
// cosses : 10 plates et 3 axiales (petites), comptées à part sur la même palette ; 1 palette de connecteurs
export const BOBINES_PAR_PALETTE: Record<'grande' | 'moyenne' | 'petite', number> = {
  grande: 1,
  moyenne: 2,
  petite: 6,
};
export const COSSES_PAR_PALETTE = 10;
export const COSSES_AXIALES_PAR_PALETTE = 3;

interface LigneRangee {
  id: number;
  type: 'bobine' | 'cosse' | 'connecteur';
  taille_bobine: 'grande' | 'moyenne' | 'petite' | null;
  type_cosse?: 'axiale' | 'plat' | null;
  quantite?: number; // nombre de produits identiques (1 par défaut)
}

export const estAxiale = (l: LigneRangee) => l.type === 'cosse' && l.type_cosse === 'axiale';

// Palette de cosses : plates et axiales, chacune avec sa capacité
export function remplissageCosses(lignes: LigneRangee[]): { plates: number; axiales: number } {
  const axiales = nombreProduits(lignes.filter(estAxiale));
  return { plates: nombreProduits(lignes) - axiales, axiales };
}

// Nombre de produits (bobines ou palettes) dans une liste de lignes
export function nombreProduits(lignes: LigneRangee[]): number {
  return lignes.reduce((s, l) => s + (l.quantite ?? 1), 0);
}

export function capacitePalette(l: LigneRangee): number {
  if (l.type === 'bobine' && l.taille_bobine) return BOBINES_PAR_PALETTE[l.taille_bobine];
  if (l.type === 'cosse') return estAxiale(l) ? COSSES_AXIALES_PAR_PALETTE : COSSES_PAR_PALETTE;
  return 1;
}

// Deux lignes peuvent partager une palette : bobines de même taille, ou cosses entre elles
export function peutPartager(a: LigneRangee, b: LigneRangee): boolean {
  if (a.type === 'bobine' && b.type === 'bobine') return a.taille_bobine === b.taille_bobine;
  return a.type === 'cosse' && b.type === 'cosse';
}

// Toute la ligne (sa quantité) peut-elle aller dans un emplacement qui contient déjà « occupants » ?
export function placeDisponible(l: LigneRangee, occupants: LigneRangee[]): boolean {
  const autres = occupants.filter((o) => o.id !== l.id);
  if (autres.length && !autres.every((o) => peutPartager(o, l))) return false;
  // cosses : les plates et les axiales sont comptées chacune à part
  const memes = l.type === 'cosse' ? autres.filter((o) => estAxiale(o) === estAxiale(l)) : autres;
  return nombreProduits(memes) + (l.quantite ?? 1) <= capacitePalette(l);
}

// ---------- Distance depuis la porte (même calcul que le serveur) ----------

// Zone tampon : places T01, T02… au sol devant les blocs A et B (nombre réglable par l'administrateur)
export function codeTampon(n: number): string {
  return `T${String(n).padStart(2, '0')}`;
}

export function estTampon(code: string | null | undefined): boolean {
  return /^T\d{2}$/.test(code ?? '');
}

export function placesTampon(capacite: number): string[] {
  return Array.from({ length: capacite }, (_, i) => codeTampon(i + 1));
}

// Place tampon sous forme d'« emplacement » (pour la sélection et le détail)
export function emplacementTampon(n: number): Emplacement {
  return { code: codeTampon(n), bloc: 'T', niveau: 0, facade: 1, numero: n, position: n - 1 };
}

// Allée d'accès : 0 = allée de la porte (D façade 1), 1 = C-D, 2 = B-C, 3 = A-B
const ALLEE: Record<string, number> = { D1: 0, D2: 1, C1: 1, C2: 2, B1: 2, B2: 3, A1: 3 };
const ECART_ENTRE_ALLEES = 6.4;

// Distance à pied depuis la porte, en nombre d'emplacements
export function distancePorte(e: Emplacement): number {
  const allee = ALLEE[`${e.bloc}${e.facade}`];
  return allee === 0 ? e.position : 10 + allee * ECART_ENTRE_ALLEES + (10 - e.position);
}

function ordreProximite(a: Emplacement, b: Emplacement): number {
  return distancePorte(a) - distancePorte(b) || b.bloc.localeCompare(a.bloc) || a.code.localeCompare(b.code);
}

// Rang de chaque emplacement dans son niveau : 1 = le plus proche de la porte
export const RANG_PROXIMITE = new Map<string, number>(
  NIVEAUX.flatMap((niveau) =>
    TOUS_LES_EMPLACEMENTS.filter((e) => e.niveau === niveau)
      .sort(ordreProximite)
      .map((e, i) => [e.code, i + 1] as [string, number])
  )
);

export const EMPLACEMENTS_PAR_PROXIMITE = [...TOUS_LES_EMPLACEMENTS].sort(
  (a, b) => a.niveau - b.niveau || ordreProximite(a, b)
);

// ---------- Connecteurs : volume, poids, taille du carton (mêmes calculs que le serveur) ----------

export interface LimitesPaletteConnecteur {
  longueur: number;
  largeur: number;
  hauteur_n3: number;
  hauteur_n4: number;
  taux: number;
  poids_max: number;
}

interface CartonMesure {
  longueur?: number | null;
  largeur?: number | null;
  hauteur?: number | null;
  poids?: number | null;
}

export function volumeCarton(c: CartonMesure): number {
  return Number(c.longueur) * Number(c.largeur) * Number(c.hauteur);
}

// Hauteur utile et volume utilisable d'une palette à ce niveau (zone tampon : comme le niveau 3)
export function limitesNiveau(niveau: number, l: LimitesPaletteConnecteur) {
  const hauteur = niveau === 4 ? l.hauteur_n4 : l.hauteur_n3;
  return { hauteur, volumeMax: (l.longueur * l.largeur * hauteur * l.taux) / 100 };
}

function cartonRentre(c: CartonMesure, l: LimitesPaletteConnecteur, hauteur: number): boolean {
  const L = Number(c.longueur), lg = Number(c.largeur);
  return Number(c.hauteur) <= hauteur && ((L <= l.longueur && lg <= l.largeur) || (L <= l.largeur && lg <= l.longueur));
}

// Message si le carton ne peut aller sur aucune palette (refusé à la saisie), sinon null
export function controlerCarton(c: CartonMesure, l: LimitesPaletteConnecteur): string | null {
  const noms: Record<string, string> = { longueur: 'longueur', largeur: 'largeur', hauteur: 'hauteur', poids: 'poids' };
  for (const champ of Object.keys(noms)) {
    const v = Number((c as Record<string, unknown>)[champ]);
    if (!Number.isFinite(v) || v <= 0) return `${noms[champ]} manquant(e) ou invalide`;
  }
  if (Number(c.poids) > l.poids_max) return `${c.poids} kg dépasse la limite de ${l.poids_max} kg par palette`;
  const ok = [3, 4].some((n) => {
    const lim = limitesNiveau(n, l);
    return cartonRentre(c, l, lim.hauteur) && volumeCarton(c) <= lim.volumeMax;
  });
  if (!ok) {
    return `ne rentre sur aucune palette (${l.longueur} × ${l.largeur} cm, hauteur ${l.hauteur_n3} cm au niveau 3, ${l.hauteur_n4} cm au niveau 4)`;
  }
  return null;
}

// Une ligne de connecteurs (un ou plusieurs cartons) peut-elle aller sur cet emplacement ?
// (contrôle approché pour proposer des emplacements ; le serveur vérifie carton par carton)
export function placeConnecteur(
  ligne: { volume?: number | null; poids_total?: number | null; hauteur?: number | null },
  occupants: { volume?: number | null; poids_total?: number | null; type: string }[],
  niveau: number,
  l: LimitesPaletteConnecteur
): boolean {
  if (occupants.some((o) => o.type !== 'connecteur')) return false;
  const lim = limitesNiveau(niveau, l);
  const volume = occupants.reduce((s, o) => s + Number(o.volume ?? 0), 0) + Number(ligne.volume ?? 0);
  const poids = occupants.reduce((s, o) => s + Number(o.poids_total ?? 0), 0) + Number(ligne.poids_total ?? 0);
  return Number(ligne.hauteur ?? 0) <= lim.hauteur && volume <= lim.volumeMax && poids <= l.poids_max + 1e-9;
}
