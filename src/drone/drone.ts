import { CommandLoop } from './loop.js';
import { CHAR, SERVICE } from '../protocol/uuids.js';
import { emergency, flatTrim, land, takeOff } from '../protocol/frames.js';
import {
  decodeBattery,
  decodeFlightState,
  isFlying,
  type FlightState,
} from '../protocol/notifications.js';
import type { Axes } from '../axes.js';
import type { Transport } from '../transport/ble.js';

export interface DroneState {
  connection: 'disconnected' | 'connected';
  flight: FlightState;
  battery: number | null;
}

export class Drone {
  private readonly loop: CommandLoop;
  private readonly listeners: ((state: DroneState) => void)[] = [];
  private state: DroneState = {
    connection: 'connected',
    flight: 'landed',
    battery: null,
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

  async init(): Promise<void> {
    await this.transport.subscribe(SERVICE.NOTIFY, CHAR.FLIGHT_STATE, (data) => {
      this.update({ flight: decodeFlightState(data) });
    });
    await this.transport.subscribe(SERVICE.NOTIFY, CHAR.BATTERY, (data) => {
      this.update({ battery: decodeBattery(data) });
    });
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
    await this.transport.write(SERVICE.CMD, CHAR.CMD, flatTrim(counters.next(CHAR.CMD)));
    await this.transport.write(SERVICE.CMD, CHAR.CMD, takeOff(counters.next(CHAR.CMD)));
    this.loop.start();
  }

  async land(): Promise<void> {
    // Relying on reported state alone would leave "Land" mute during the whole
    // take-off — the state starts at `landed` and only moves on the first
    // `fb0e` notification. Yet this is the reflex control: it must answer as
    // soon as the drone has been commanded.
    if (!this.airborne) return;

    await this.transport.write(
      SERVICE.CMD,
      CHAR.CMD,
      land(this.transport.counters.next(CHAR.CMD)),
    );
    this.loop.stop();
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

  setAxes(axes: Axes): void {
    this.loop.setAxes(axes);
  }

  handleDisconnect(): void {
    this.loop.stop();
    this.update({ connection: 'disconnected' });
  }

  private update(patch: Partial<DroneState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}
