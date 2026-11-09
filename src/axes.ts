/**
 * Les quatre axes normalisés sont la seule interface entre les schémas de
 * commande et le reste de l'application. Chaque valeur est un entier signé
 * dans -100..100.
 */
export type Axes = { roll: number; pitch: number; yaw: number; gaz: number };

export const NEUTRAL: Axes = { roll: 0, pitch: 0, yaw: 0, gaz: 0 };

/**
 * Borne à -100..100 et arrondit à l'entier.
 * Normalise -0 en 0 : `Math.round` produit -0 pour les entrées négatives
 * proches de zéro, et une comparaison stricte distingue -0 de 0.
 */
export function clamp(value: number): number {
  const bounded = Math.min(100, Math.max(-100, value));
  const rounded = Math.round(bounded);
  return rounded === 0 ? 0 : rounded;
}

/**
 * Annule tout écart inférieur ou égal au seuil, puis remet le reste à
 * l'échelle sur l'intervalle restant, de sorte que la sortie atteigne
 * toujours 100 au maximum de l'entrée.
 */
export function applyDeadzone(value: number, deadzone: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  const span = 100 - deadzone;
  if (span <= 0) return 0;
  const scaled = ((magnitude - deadzone) / span) * 100;
  return clamp(Math.sign(value) * scaled);
}

/**
 * Position du doigt rapportée au rayon du manche, en pourcentage.
 * L'axe `y` est positif vers le haut de l'écran, alors que les coordonnées
 * d'un écran croissent vers le bas — d'où l'inversion.
 */
export function stickToAxes(
  dx: number,
  dy: number,
  radius: number,
): { x: number; y: number } {
  if (radius <= 0) return { x: 0, y: 0 };
  return { x: clamp((dx / radius) * 100), y: clamp((-dy / radius) * 100) };
}
