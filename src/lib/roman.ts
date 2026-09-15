// Section numerals are roman, decorative and consistent, never the only way
// to identify a screen. Subtractive form, so 4 is IV and 1994 is MCMXCIV.
const numerals: readonly (readonly [number, string])[] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function toRoman(value: number): string {
  let remainder = value;
  let result = "";
  for (const [size, numeral] of numerals) {
    while (remainder >= size) {
      result += numeral;
      remainder -= size;
    }
  }
  return result;
}
