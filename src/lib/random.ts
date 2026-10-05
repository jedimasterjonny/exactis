// A stream of draws from the standard normal distribution, nought on
// average and one either side of it two times in three, the same stream
// every time for the same seed: so a set of futures drawn from a seed is
// drawn again exactly, and a change in what they come to is a change in
// the plan rather than in the draw. The uniform draws beneath it are
// mulberry32's, a 32-bit generator in a few lines that passes the usual
// tests for a stream this short, and each pair of them is turned into a
// normal by Box and Muller's transform, keeping one of the two it
// gives. One less than a uniform draw is taken into the logarithm, which
// so never meets nought.
export function normalsFrom(seed: number): () => number {
  let state = seed;
  const uniform = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
  return () =>
    Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}
