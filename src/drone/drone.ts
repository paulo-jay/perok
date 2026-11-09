import { CommandLoop } from './loop.js';
import { CHAR, SERVICE } from '../protocol/uuids.js';
import { emergency, flatTrim, land, takeOff } from '../protocol/frames.js';
import {
  decodeBattery,
  decodeFlightState,
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
    // Les compteurs viennent du transport : la poignée de main a déjà
    // consommé des séquences sur `fa0b`.
    this.loop = new CommandLoop(transport, transport.counters);
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

  /** Le flat trim précède le décollage, comme dans l'implémentation prouvée. */
  async takeOff(): Promise<void> {
    const counters = this.transport.counters;
    await this.transport.write(SERVICE.CMD, CHAR.CMD, flatTrim(counters.next(CHAR.CMD)));
    await this.transport.write(SERVICE.CMD, CHAR.CMD, takeOff(counters.next(CHAR.CMD)));
    this.loop.start();
  }

  async land(): Promise<void> {
    if (this.state.flight === 'landed') return;
    await this.transport.write(
      SERVICE.CMD,
      CHAR.CMD,
      land(this.transport.counters.next(CHAR.CMD)),
    );
    this.loop.stop();
  }

  /** Coupe les moteurs sans condition : le drone tombe sur place. */
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
