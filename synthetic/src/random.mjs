import { createHash } from 'node:crypto';

/** SHA-256 tuple -> first four bytes, little endian -> mulberry32 stream. */
export function makeRng(seed, label) {
  let state = createHash('sha256').update(JSON.stringify([seed, label])).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** Copying, descending Fisher-Yates; does not mutate the source collection. */
export function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function stableId(namespace, ...parts) {
  return `${namespace}_${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)}`;
}
