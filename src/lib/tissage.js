/**
 * Moteur de tissage — calcul de la grille, pattern noise, attribution des armures.
 *
 * Reproduit fidèlement la logique du projet Processing "Paysage".
 */

import { FORMATS, FORMAT_DEFAULT, RATIO, px, calcAncrage } from './formats.js';
import { armuresPool, flotteChaine, flotteTrame, serge } from './armures.js';

// ---------------------------------------------------------------------------
// PRNG seedable (mulberry32 — compatible avec les besoins du projet)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a seeded random integer in [min, max) — like Processing randomInt.
 */
function seededRandomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min));
}

// ---------------------------------------------------------------------------
// Perlin noise (classic Ken Perlin implementation, matches p5.js behaviour)
// ---------------------------------------------------------------------------

const PERLIN_YWRAPB = 4;
const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
const PERLIN_ZWRAPB = 8;
const PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
const PERLIN_SIZE = 4095;
const PERLIN_OCTAVES = 4;
const PERLIN_FALLOFF = 0.5;

let perlin = null;

function scaled_cosine(i) {
  return 0.5 * (1.0 - Math.cos(i * Math.PI));
}

function noiseSeed(seed) {
  const rng = mulberry32(seed);
  perlin = new Array(PERLIN_SIZE + 1);
  for (let i = 0; i < PERLIN_SIZE + 1; i++) {
    perlin[i] = rng();
  }
}

function noise(x, y = 0, z = 0) {
  if (perlin === null) {
    noiseSeed(0);
  }

  if (x < 0) x = -x;
  if (y < 0) y = -y;
  if (z < 0) z = -z;

  let xi = Math.floor(x);
  let yi = Math.floor(y);
  let zi = Math.floor(z);

  let xf = x - xi;
  let yf = y - yi;
  let zf = z - zi;

  let r = 0;
  let ampl = 0.5;

  for (let o = 0; o < PERLIN_OCTAVES; o++) {
    let of_ = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);

    const rxf = scaled_cosine(xf);
    const ryf = scaled_cosine(yf);

    let n1 = perlin[of_ & PERLIN_SIZE];
    n1 += rxf * (perlin[(of_ + 1) & PERLIN_SIZE] - n1);
    let n2 = perlin[(of_ + PERLIN_YWRAP) & PERLIN_SIZE];
    n2 += rxf * (perlin[(of_ + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
    n1 += ryf * (n2 - n1);

    of_ += PERLIN_ZWRAP;
    n2 = perlin[of_ & PERLIN_SIZE];
    n2 += rxf * (perlin[(of_ + 1) & PERLIN_SIZE] - n2);
    let n3 = perlin[(of_ + PERLIN_YWRAP) & PERLIN_SIZE];
    n3 += rxf * (perlin[(of_ + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
    n2 += ryf * (n3 - n2);

    n1 += scaled_cosine(zf) * (n2 - n1);

    r += n1 * ampl;
    ampl *= PERLIN_FALLOFF;

    xi <<= 1;
    xf *= 2;
    yi <<= 1;
    yf *= 2;
    zi <<= 1;
    zf *= 2;

    if (xf >= 1.0) { xi++; xf--; }
    if (yf >= 1.0) { yi++; yf--; }
    if (zf >= 1.0) { zi++; zf--; }
  }

  return r;
}

// ---------------------------------------------------------------------------
// Classe Tissage
// ---------------------------------------------------------------------------

export class Tissage {
  /**
   * @param {object} opts
   * @param {string} opts.formatKey — clé du format (ex: '50x70')
   * @param {number} opts.warpThickness — épaisseur chaîne en cm
   * @param {number} opts.weftThickness — épaisseur trame en cm
   * @param {number} opts.weftSpace — espace entre trames en cm
   * @param {number} opts.id — seed (0–99999)
   */
  constructor(opts = {}) {
    this.formatKey = opts.formatKey ?? FORMAT_DEFAULT;
    this.format = FORMATS[this.formatKey];
    this.warpThickness = opts.warpThickness ?? 0.3;
    this.weftThickness = opts.weftThickness ?? 0.3;
    this.weftSpace = opts.weftSpace ?? 0.06;
    this.id = opts.id ?? Math.floor(Math.random() * 100000);
    this.r = 2; // zoom du bruit

    this.grid = [];
    this.colorMap = [];
    this.arm1 = null;
    this.arm2 = null;
    this.horizon = 0.5;

    this.compute();
  }

  /** Recalcule tout (grille, pattern, armures). */
  compute() {
    this.format = FORMATS[this.formatKey];
    this._calcGrid();
    this._calcPattern();
    this._assignArmures();
  }

  // --- Grid dimensions ---

  _calcGrid() {
    const ouv = this.format.ouverture;

    // Nombre de fils de trame
    const espacementCm = this.weftThickness + this.weftSpace;
    let count = 0;
    let y = 0;
    while (y + this.weftThickness <= ouv.y) {
      count++;
      y += espacementCm;
    }
    this.weftQuantity = count;
    this.hauteurTissage = this.weftQuantity * espacementCm - this.weftSpace;

    // Nombre de fils de chaîne
    this.warpQuantity = Math.floor(ouv.x / this.warpThickness);
    this.largeurTissage = this.warpQuantity * this.warpThickness;

    // Ancrage
    this.ancrage = calcAncrage(this.format, this.largeurTissage, this.hauteurTissage);
  }

  // --- Pattern noise (carte de couleurs) ---

  _calcPattern() {
    noiseSeed(this.id);

    this.colorMap = [];

    for (let y = 0; y < this.weftQuantity; y++) {
      const row = [];
      for (let x = 0; x < this.warpQuantity; x++) {
        // Formule atypique fidèle au projet original
        const n = noise(
          (this.warpQuantity / (x + 0.001)) / this.r,
          (this.weftQuantity / (y + 0.001)) / this.r
        );

        let couleur;
        if (x < 3 || x >= this.warpQuantity - 3) {
          couleur = 127; // Lisières — toujours gris
        } else if (n < 0.3) {
          couleur = 0;   // Zone noire → flottés de trame
        } else if (n < 0.6) {
          couleur = 127; // Zone grise → armure structurée
        } else {
          couleur = 255; // Zone blanche → flottés de chaîne
        }

        row.push(couleur);
      }
      this.colorMap.push(row);
    }
  }

  // --- Attribution des armures ---

  _assignArmures() {
    const rng = mulberry32(this.id);

    this.arm1 = armuresPool[seededRandomInt(rng, 0, armuresPool.length)];
    this.arm2 = armuresPool[seededRandomInt(rng, 0, armuresPool.length)];

    const f = seededRandomInt(rng, 1, 5); // 1..4
    this.horizon = f * 0.25;

    // Build grid
    this.grid = [];
    const espacementCm = this.weftThickness + this.weftSpace;

    for (let y = 0; y < this.weftQuantity; y++) {
      const row = [];
      for (let x = 0; x < this.warpQuantity; x++) {
        const couleur = this.colorMap[y][x];

        let armure;
        switch (couleur) {
          case 0:
            armure = flotteTrame;
            break;
          case 127:
            armure = (y < this.weftQuantity * this.horizon) ? this.arm1 : this.arm2;
            break;
          case 255:
            armure = flotteChaine;
            break;
          default:
            armure = serge;
            break;
        }

        const isBlack = armure[y % armure.length][x % armure[0].length] === 1;

        row.push({
          position: {
            x: x * this.warpThickness,
            y: y * espacementCm,
          },
          index: { x, y },
          isBlack,
          couleur,
        });
      }
      this.grid.push(row);
    }
  }

  /** Génère un nouvel ID et recalcule. */
  regenerate() {
    this.id = Math.floor(Math.random() * 100000);
    this.compute();
  }

  /** Met à jour avec un ID spécifique. */
  setId(id) {
    this.id = id;
    this.compute();
  }

  /** Timecode pour l'export. */
  getTimecode() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}_${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}_${this.warpThickness}x${this.weftThickness} - ID : ${this.id}`;
  }

  /** Info text pour l'export. */
  getInfoText() {
    return [
      `nombre de trame : ${this.weftQuantity}`,
      `nombre de chaine : ${this.warpQuantity}`,
      `chaine x trame : ${this.warpThickness}x${this.weftThickness} cm`,
      `ID : ${this.id}`,
    ].join('\n');
  }
}
