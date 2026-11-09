import type { LimitName, SettingRange } from '../protocol/notifications.js';

// The vocabulary belongs to the protocol layer, which decides which settings
// the drone reports; re-exported so callers of the model need one import.
export type { LimitName };

/**
 * What the drone says its own flight limits may be.
 *
 * The firmware reports a current value and the bounds it will accept for each
 * limit, so nothing here is hardcoded: a range the drone never announced is
 * unknown, and a value outside the announced bounds is clamped rather than
 * sent. Sending a limit the firmware rejects would look to the pilot like a
 * control that does nothing.
 */
export class FlightLimits {
  private readonly ranges = new Map<LimitName, SettingRange>();

  report(name: LimitName, range: SettingRange): void {
    this.ranges.set(name, range);
  }

  range(name: LimitName): SettingRange | null {
    return this.ranges.get(name) ?? null;
  }

  /** Null while the drone has not reported this limit yet. */
  sanitize(name: LimitName, requested: number): number | null {
    const range = this.ranges.get(name);
    if (!range) return null;
    return Math.min(range.max, Math.max(range.min, requested));
  }

  /** Reported limits, in the order the drone announced them. */
  get known(): readonly LimitName[] {
    return [...this.ranges.keys()];
  }
}
