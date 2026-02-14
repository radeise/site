/**
 * Bibliothèque d'armures textiles.
 * Chaque armure est une matrice 2D de 0 et 1.
 * 1 = la chaîne passe au-dessus de la trame (case noire au rendu).
 * 0 = la trame passe au-dessus (case blanche).
 * Les armures sont répétées en tuile (modulo) sur la grille.
 */

export const toile = [
  [0, 1],
  [1, 0],
];

export const natte = [
  [0, 0, 1, 1],
  [0, 0, 1, 1],
  [1, 1, 0, 0],
  [1, 1, 0, 0],
];

export const reps = [
  [0, 0, 1, 1],
  [1, 1, 0, 0],
];

export const reps2 = [
  [0, 1],
  [0, 1],
  [1, 0],
  [1, 0],
];

export const serge = [
  [0, 0, 1],
  [0, 1, 0],
  [1, 0, 0],
];

export const serge3 = [
  [0, 0, 0, 1],
  [0, 0, 1, 0],
  [0, 1, 0, 0],
  [1, 0, 0, 0],
];

export const diagonale = [
  [0, 0, 0, 0, 1],
  [0, 0, 0, 1, 0],
  [0, 0, 1, 0, 0],
  [0, 1, 0, 0, 0],
  [1, 0, 0, 0, 0],
];

export const diagonale2 = [
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 0],
];

export const chevron = [
  [1, 0, 0, 1, 0, 0],
  [0, 0, 1, 0, 1, 0],
  [0, 1, 0, 0, 0, 1],
];

export const losange = [
  [0, 0, 1, 0],
  [0, 1, 0, 1],
  [1, 0, 0, 0],
  [0, 1, 0, 1],
];

export const losange3 = [
  [0, 1, 1, 0, 1, 1, 0, 0],
  [1, 1, 0, 0, 0, 1, 1, 0],
  [1, 0, 0, 0, 0, 0, 1, 1],
  [1, 1, 0, 0, 0, 1, 1, 0],
  [0, 1, 1, 0, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 0],
  [0, 0, 1, 1, 1, 0, 0, 0],
];

export const satin5 = [
  [0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0],
  [0, 0, 0, 0, 1],
  [0, 0, 1, 0, 0],
  [1, 0, 0, 0, 0],
];

export const satin8 = [
  [0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 1],
  [0, 0, 0, 0, 1, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0],
  [0, 0, 0, 1, 0, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 0, 0],
];

/** Chaîne flotte au-dessus (zone blanche) — tout à 0 */
export const flotteChaine = [
  [0, 0],
  [0, 0],
];

/** Trame flotte au-dessus (zone noire) — tout à 1 */
export const flotteTrame = [
  [1, 1],
  [1, 1],
];

/** Pool de sélection aléatoire pour les zones grises */
export const armuresPool = [
  serge, serge3, diagonale, diagonale2, chevron,
  losange, losange3, satin5, satin8, natte, reps, reps2,
];
