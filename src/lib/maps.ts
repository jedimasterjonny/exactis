// What a map holds for a key, worked out and kept there first where it
// holds nothing: the get-or-create every cache of worked-out figures
// reads through, over a Map or a WeakMap alike. What is kept is never
// worked out again, so a cache reads through here only for figures that
// come out the same however often they are worked out.
export function keptIn<TKey, TValue>(
  map: {
    get: (key: TKey) => TValue | undefined;
    set: (key: TKey, value: TValue) => unknown;
  },
  key: TKey,
  make: () => TValue,
): TValue {
  const known = map.get(key);
  if (known !== undefined) {
    return known;
  }
  const made = make();
  map.set(key, made);
  return made;
}
