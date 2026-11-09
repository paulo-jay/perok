/**
 * The four normalized axes are the only interface between the control schemes
 * and the rest of the application. Each value is a signed integer in -100..100.
 */
export type Axes = { roll: number; pitch: number; yaw: number; gaz: number };

export const NEUTRAL: Axes = { roll: 0, pitch: 0, yaw: 0, gaz: 0 };

/**
 * Clamps to -100..100 and rounds to an integer.
 *
 * Normalizes -0 to 0: `Math.round` yields -0 for negative inputs close to zero,
 * and a strict comparison tells -0 apart from 0.
 */
export function clamp(value: number): number {
  const bounded = Math.min(100, Math.max(-100, value));
  const rounded = Math.round(bounded);
  return rounded === 0 ? 0 : rounded;
}

/**
 * Zeroes any deflection at or below the threshold, then rescales what is left
 * linearly over the remaining range, so the output still reaches 100 at full
 * input.
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
 * Finger position relative to the stick radius, as a percentage.
 *
 * `y` is positive towards the top of the screen, whereas screen coordinates
 * grow downwards — hence the inversion.
 */
export function stickToAxes(
  dx: number,
  dy: number,
  radius: number,
): { x: number; y: number } {
  if (radius <= 0) return { x: 0, y: 0 };
  return { x: clamp((dx / radius) * 100), y: clamp((-dy / radius) * 100) };
}
