import { applyDeadzone, stickToAxes, type Axes } from '../axes.js';

/** Valeur de départ, à ajuster en vol réel. */
const DEFAULT_DEADZONE = 10;

type Point = { x: number; y: number };
type Side = 'left' | 'right';

/**
 * Correspondance fixée par la conception : manche gauche pour l'altitude et
 * la rotation, manche droit pour le tangage et le roulis — la disposition
 * d'une radiocommande classique.
 */
export function combineSticks(
  left: Point,
  right: Point,
  deadzone: number = DEFAULT_DEADZONE,
): Axes {
  return {
    roll: applyDeadzone(right.x, deadzone),
    pitch: applyDeadzone(right.y, deadzone),
    yaw: applyDeadzone(left.x, deadzone),
    gaz: applyDeadzone(left.y, deadzone),
  };
}

/**
 * Deux manches virtuels suivis au doigt. `setPointerCapture` garde le doigt
 * suivi même lorsqu'il sort de la zone du manche, et `pointerId` permet de
 * piloter les deux manches simultanément.
 */
export class DualStickInput {
  private readonly left: Point = { x: 0, y: 0 };
  private readonly right: Point = { x: 0, y: 0 };
  private readonly pointers = new Map<number, Side>();
  private readonly cleanups: (() => void)[] = [];

  constructor(
    leftEl: HTMLElement,
    rightEl: HTMLElement,
    private readonly onChange: (axes: Axes) => void,
    private readonly deadzone: number = DEFAULT_DEADZONE,
  ) {
    this.bind(leftEl, 'left');
    this.bind(rightEl, 'right');
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.pointers.clear();
  }

  private bind(el: HTMLElement, side: Side): void {
    const down = (event: PointerEvent): void => {
      // La capture est un confort — garder le doigt suivi hors de la zone.
      // Si elle échoue, le manche doit rester utilisable, pas devenir muet.
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        /* ignoré */
      }
      this.pointers.set(event.pointerId, side);
      this.track(el, side, event);
    };

    const move = (event: PointerEvent): void => {
      if (this.pointers.get(event.pointerId) !== side) return;
      this.track(el, side, event);
    };

    const release = (event: PointerEvent): void => {
      if (!this.pointers.delete(event.pointerId)) return;
      const stick = this.stick(side);
      stick.x = 0;
      stick.y = 0;
      this.emit();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    this.cleanups.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
    });
  }

  private track(el: HTMLElement, side: Side, event: PointerEvent): void {
    const rect = el.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);

    const { x, y } = stickToAxes(dx, dy, radius);
    const stick = this.stick(side);
    stick.x = x;
    stick.y = y;
    this.emit();
  }

  private stick(side: Side): Point {
    return side === 'left' ? this.left : this.right;
  }

  private emit(): void {
    this.onChange(combineSticks(this.left, this.right, this.deadzone));
  }
}
