/**
 * Formats papier — dimensions en centimètres.
 * cadre = dimensions extérieures du papier
 * ouverture = zone de tissage visible (comme un passe-partout)
 * pliage = true pour les cartes pliées (ancrage CORNER)
 */

export const FORMATS = {
  A6:          { nom: 'A6',          ouverture: { x: 5.5,  y: 9.8 },  cadre: { x: 10.5, y: 14.8 }, pliage: false },
  A5:          { nom: 'A5',          ouverture: { x: 10,   y: 14 },   cadre: { x: 14.8, y: 21 },    pliage: false },
  carte:       { nom: 'carte',       ouverture: { x: 6,    y: 10.5 }, cadre: { x: 22,   y: 15.5 },  pliage: true },
  '20x20':     { nom: '20x20',       ouverture: { x: 10.5, y: 10.5 }, cadre: { x: 20,   y: 20 },    pliage: false },
  '23x23':     { nom: '23x23',       ouverture: { x: 12,   y: 12 },   cadre: { x: 23,   y: 23 },    pliage: false },
  A4:          { nom: 'A4',          ouverture: { x: 11,   y: 15.5 }, cadre: { x: 21,   y: 29.7 },  pliage: false },
  'A3+':       { nom: 'A3+',         ouverture: { x: 17,   y: 25 },   cadre: { x: 33,   y: 48 },    pliage: false },
  '30x40':     { nom: '30x40',       ouverture: { x: 15.5, y: 21 },   cadre: { x: 30,   y: 40 },    pliage: false },
  '40x50':     { nom: '40x50',       ouverture: { x: 21,   y: 26 },   cadre: { x: 40,   y: 50 },    pliage: false },
  '50x70':     { nom: '50x70',       ouverture: { x: 26,   y: 36.5 }, cadre: { x: 50,   y: 70 },    pliage: false },
  '61x91':     { nom: '61x91',       ouverture: { x: 32,   y: 47.5 }, cadre: { x: 61,   y: 91 },    pliage: false },
  echantillon: { nom: 'échantillon', ouverture: { x: 16,   y: 8 },    cadre: { x: 21,   y: 10 },    pliage: false },
};

export const FORMAT_DEFAULT = '50x70';

/** 1 cm = 28.35 pixels (72 dpi) */
export const RATIO = 28.35;

/** Conversion cm → px */
export function px(cm) {
  return cm * RATIO;
}

/**
 * Calcule l'ancrage (position du tissage dans le cadre) en cm.
 */
export function calcAncrage(format, largeurTissage, hauteurTissage) {
  const { cadre, ouverture, pliage } = format;

  if (pliage) {
    // Mode CORNER : calé en haut à gauche du demi-cadre
    return {
      x: (cadre.x / 2 - ouverture.x) / 2,
      y: (cadre.y - hauteurTissage) / 2,
    };
  }

  // Mode CENTER : centré dans le cadre
  return {
    x: (cadre.x - largeurTissage) / 2,
    y: (cadre.y - hauteurTissage) / 2,
  };
}
