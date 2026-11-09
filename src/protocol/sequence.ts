/**
 * Every write characteristic carries its own sequence counter, incremented on
 * each send and one byte wide.
 *
 * The wrap is not an edge case: at 50 ms, `fa0a` passes 255 sends in 12.8
 * seconds, so it happens on every single flight.
 */
export class SequenceCounters {
  private readonly counters = new Map<string, number>();

  next(characteristic: string): number {
    const value = ((this.counters.get(characteristic) ?? 0) + 1) & 0xff;
    this.counters.set(characteristic, value);
    return value;
  }
}
