/**
 * Chaque caractéristique d'écriture porte son propre compteur de séquence,
 * incrémenté à chaque envoi et borné à un octet.
 *
 * Le bouclage n'est pas un cas limite : à 50 ms, `fa0a` dépasse 255 envois
 * en 12,8 secondes, donc à chaque vol.
 */
export class SequenceCounters {
  private readonly counters = new Map<string, number>();

  next(characteristic: string): number {
    const value = ((this.counters.get(characteristic) ?? 0) + 1) & 0xff;
    this.counters.set(characteristic, value);
    return value;
  }
}
