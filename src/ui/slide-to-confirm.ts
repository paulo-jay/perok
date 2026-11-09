/** Proportion de la piste à parcourir pour que la confirmation parte. */
const CONFIRM_RATIO = 0.95;

/**
 * Piste à parcourir entièrement du doigt. C'est la seule voie vers la coupure
 * moteur : un appui simple ne doit jamais faire tomber le drone, alors qu'un
 * relâchement avant le bout annule et ramène la poignée.
 */
export class SlideToConfirm {
  private readonly handle: HTMLElement;
  private activePointer: number | null = null;
  private originX = 0;

  constructor(
    private readonly track: HTMLElement,
    private readonly onConfirm: () => void,
  ) {
    const handle = track.querySelector<HTMLElement>('[data-handle]');
    if (!handle) throw new Error('Piste de confirmation sans poignée');
    this.handle = handle;

    handle.addEventListener('pointerdown', this.onDown);
    handle.addEventListener('pointermove', this.onMove);
    handle.addEventListener('pointerup', this.onUp);
    handle.addEventListener('pointercancel', this.onUp);
  }

  private get maxTravel(): number {
    return Math.max(1, this.track.clientWidth - this.handle.offsetWidth - 8);
  }

  private readonly onDown = (event: PointerEvent): void => {
    this.handle.setPointerCapture(event.pointerId);
    this.activePointer = event.pointerId;
    this.originX = event.clientX;
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (this.activePointer !== event.pointerId) return;

    const travel = Math.min(this.maxTravel, Math.max(0, event.clientX - this.originX));
    this.handle.style.transform = `translateX(${travel}px)`;

    if (travel >= this.maxTravel * CONFIRM_RATIO) {
      this.reset();
      this.onConfirm();
    }
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (this.activePointer !== event.pointerId) return;
    this.reset();
  };

  private reset(): void {
    this.activePointer = null;
    this.handle.style.transform = 'translateX(0)';
  }
}
