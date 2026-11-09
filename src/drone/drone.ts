import { CommandLoop } from './loop.js';
import { FlightLimits, type LimitName } from './limits.js';
import { CHAR, NOTIFY_CHARS, SERVICE } from '../protocol/uuids.js';
import {
  emergency,
  land,
  lightControl,
  maxAltitude,
  maxRotationSpeed,
  maxTilt,
  maxVerticalSpeed,
  takeOff,
  // Aliased where a method of the same name exists, so it is never unclear
  // which one a call refers to.
  flatTrim as flatTrimFrame,
  flip as flipFrame,
  takePicture as takePictureFrame,
  type FlipDirection,
  type LightMode,
} from '../protocol/frames.js';
import {
  decodeBattery,
  decodeFlightState,
  isFlying,
  routeNotification,
  type FlightState,
  type PictureOutcome,
} from '../protocol/notifications.js';
import type { Axes } from '../axes.js';
import type { Transport, TransportStats } from '../transport/ble.js';

export interface DroneState {
  connection: 'disconnected' | 'connected';
  flight: FlightState;
  battery: number | null;
  picture: PictureOutcome | null;
  light: { id: number; intensity: number } | null;
}

/** Which builder sends which limit. */
const LIMIT_FRAMES: Record<LimitName, (seq: number, value: number) => Uint8Array> = {
  maxAltitude,
  maxTilt,
  maxVerticalSpeed,
  maxRotationSpeed,
};

export class Drone {
  private readonly loop: CommandLoop;
  private readonly listeners: ((state: DroneState) => void)[] = [];
  private readonly flightLimits = new FlightLimits();
  private state: DroneState = {
    connection: 'connected',
    flight: 'landed',
    battery: null,
    picture: null,
    light: null,
  };

  constructor(private readonly transport: Transport) {
    // The counters come from the transport: the handshake has already consumed
    // sequences on `fa0b`.
    // If the loop gives up, the link is lost: take the same path as a
    // disconnect rather than letting the interface lie.
    this.loop = new CommandLoop(transport, transport.counters, undefined, () => {
      this.handleDisconnect();
    });
  }

  /**
   * True as soon as the loop is commanding the drone, without waiting for the
   * state notification — which may lag or never arrive.
   */
  get airborne(): boolean {
    return this.loop.running || isFlying(this.state.flight);
  }

  get limits(): FlightLimits {
    return this.flightLimits;
  }

  /** Link counters, so a sluggish session can be diagnosed from the app. */
  get stats(): TransportStats {
    return this.transport.stats;
  }

  /** Setpoint ticks dropped because the link had not caught up. */
  get skippedTicks(): number {
    return this.loop.skippedTicks;
  }

  init(): Promise<void> {
    // Every notification goes through one handler that identifies it by its
    // frame header. Reading the flight state from a fixed byte of whatever
    // lands on `fb0e` was wrong: that characteristic's class also carries
    // `AlertStateChanged`, whose `cut_out` value is the same byte as
    // `hovering` — so stopping the propellers by hand could report a hovering
    // drone and arm a flip on the ground.
    //
    // Registering a listener costs no GATT work: the characteristics were
    // subscribed once when the transport opened. Subscribing them again here
    // put ten serialised GATT operations between the handshake and the
    // pilot's first command.
    this.transport.onNotification((data) => {
      this.handleNotification(data);
    });
    return Promise.resolve();
  }

  private handleNotification(data: DataView): void {
    const notification = routeNotification(data);
    if (!notification) return;

    switch (notification.kind) {
      case 'flight':
        this.update({ flight: notification.state });
        return;
      case 'battery':
        this.update({ battery: notification.percent });
        return;
      case 'limit':
        this.flightLimits.report(notification.name, notification.range);
        this.update({});
        return;
      case 'picture':
        this.update({ picture: notification.outcome });
        return;
      case 'light':
        this.update({
          light: notification.state
            ? {
                id: notification.state.id,
                intensity: notification.state.intensity,
              }
            : null,
        });
        return;
    }
  }

  onState(listener: (state: DroneState) => void): void {
    this.listeners.push(listener);
  }

  /** Flat trim precedes take-off, as in the proven implementation. */
  async takeOff(): Promise<void> {
    // Flat trim recalibrates the inertial unit's horizon: sending it in flight
    // would throw the drone off, and a second take-off makes no sense.
    if (this.airborne) return;

    const counters = this.transport.counters;
    await this.transport.write(
      SERVICE.CMD,
      CHAR.CMD,
      flatTrimFrame(counters.next(CHAR.CMD)),
    );
    await this.transport.write(SERVICE.CMD, CHAR.CMD, takeOff(counters.next(CHAR.CMD)));
    this.loop.start();
  }

  async land(): Promise<void> {
    // Relying on reported state alone would leave "Land" mute during the whole
    // take-off — the state starts at `landed` and only moves on the first
    // `fb0e` notification. Yet this is the reflex control: it must answer as
    // soon as the drone has been commanded.
    if (!this.airborne) return;

    try {
      await this.transport.write(
        SERVICE.CMD,
        CHAR.CMD,
        land(this.transport.counters.next(CHAR.CMD)),
      );
    } finally {
      // Whether or not the command got through. Stopping only on success left
      // one refused land streaming setpoints for ever, with `airborne` stuck
      // true — so take-off locked out and every control looked dead from then
      // on.
      this.loop.stop();
    }
  }

  /** Cuts the motors unconditionally: the drone drops where it is. */
  async emergency(): Promise<void> {
    this.loop.stop();
    await this.transport.write(
      SERVICE.CMD,
      CHAR.EMERGENCY,
      emergency(this.transport.counters.next(CHAR.EMERGENCY)),
    );
  }

  /** Recalibrates the inertial horizon, which only makes sense on the ground. */
  async flatTrim(): Promise<void> {
    if (this.airborne) return;
    await this.write(CHAR.CMD, flatTrimFrame);
  }

  /**
   * A flip needs a *stable* drone, not merely a commanded one — so this uses
   * the reported state, unlike `land`, which must answer during take-off.
   */
  async flip(direction: FlipDirection = 'right'): Promise<void> {
    if (this.state.flight !== 'hovering') return;
    await this.write(CHAR.CMD, (seq) => flipFrame(seq, direction));
  }

  /** Clamped to what the drone says it accepts; silent until it has said. */
  async setLimit(name: LimitName, value: number): Promise<void> {
    const safe = this.flightLimits.sanitize(name, value);
    if (safe === null) return;
    await this.write(CHAR.CMD, (seq) => LIMIT_FRAMES[name](seq, safe));
  }

  /** The image stays in the drone's flash; this app cannot retrieve it. */
  async takePicture(): Promise<void> {
    await this.write(CHAR.CMD, takePictureFrame);
  }

  /** Only reachable once the drone has announced a light of its own. */
  async setLight(mode: LightMode, intensity: number): Promise<void> {
    const light = this.state.light;
    if (!light) return;
    await this.write(CHAR.CMD, (seq) => lightControl(seq, light.id, mode, intensity));
  }

  setAxes(axes: Axes): void {
    this.loop.setAxes(axes);
  }

  handleDisconnect(): void {
    this.loop.stop();
    this.update({ connection: 'disconnected' });
  }

  /** One place where a sequence number is drawn and a frame goes out. */
  private async write(
    characteristic: string,
    build: (seq: number) => Uint8Array,
  ): Promise<void> {
    await this.transport.write(
      SERVICE.CMD,
      characteristic,
      build(this.transport.counters.next(characteristic)),
    );
  }

  private update(patch: Partial<DroneState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}
