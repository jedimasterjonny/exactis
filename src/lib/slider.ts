// What a slider of one thumb holds. Base UI types what a slider reports
// as a number or a list of them, and the vendored slider draws a thumb
// per entry of a list, so it is handed a list of one and the one is
// read back. Flattened rather than narrowed, so there is no branch for
// a shape it never takes.
export function thumbOf(value: number | readonly number[]): number {
  return Math.max(...[value].flat());
}
