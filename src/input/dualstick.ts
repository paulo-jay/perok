import { applyDeadzone, stickToAxes, type Axes } from '../axes.js';

/** Starting value, to be tuned in real flight. */
const DEFAULT_DEADZONE = 10;

type Point = { x: number; y: number };
type Side = 'left' | 'right';

/**
 * Mapping fixed by the design, following the game-controller convention: the
 * **left** stick moves the drone in all four directions (pitch and roll), the
 * **right** stick handles altitude and heading (gaz and yaw). More natural for
 * anyone who has held a gamepad than a radio-transmitter layout.
 */
export function combineSticks(
  left: Point,
  right: Point,
  deadzone: number = DEFAULT_DEADZONE,
): Axes {
  return {
    roll: applyDeadzone(left.x, deadzone),
    pitch: applyDeadzone(left.y, deadzone),
    yaw: applyDeadzone(right.x, deadzone),
    gaz: applyDeadzone(right.y, deadzone),
  };
}

/**
 * Two virtual sticks tracked by finger. `setPointerCapture` keeps the finger
 * tracked even when it leaves the stick's area, and `pointerId` allows both
 * sticks to be driven at once.
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
    this.bindFallbacks();
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.pointers.clear();
  }

  private bind(el: HTMLElement, side: Side): void {
    const down = (event: PointerEvent): void => {
      // Capture is a convenience — keeping the finger tracked outside the
      // area. If it fails, the stick must stay usable rather than go mute.
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        /* ignored */
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
      this.center(this.stick(side));
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

  /**
   * Safety nets. The listeners on the stick itself only receive the release
   * thanks to pointer capture; if that failed, a finger lifted outside the
   * area never produces an event on the stick, which then stays frozen at its
   * last value — and the loop keeps commanding that movement. Likewise, a page
   * hidden mid-flight (an incoming call) would leave the last setpoints going
   * out with the pilot unable to see anything.
   */
  private bindFallbacks(): void {
    const release = (event: PointerEvent): void => {
      const side = this.pointers.get(event.pointerId);
      if (side === undefined) return;
      this.pointers.delete(event.pointerId);
      this.center(this.stick(side));
      this.emit();
    };

    const releaseAll = (): void => {
      this.pointers.clear();
      this.center(this.left);
      this.center(this.right);
      this.emit();
    };

    const onVisibility = (): void => {
      if (document.hidden) releaseAll();
    };

    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('lostpointercapture', release);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibility);

    this.cleanups.push(() => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('lostpointercapture', release);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  private center(stick: Point): void {
    stick.x = 0;
    stick.y = 0;
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
