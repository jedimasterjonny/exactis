// The Dorset average price for a detached house as the Land Registry
// gave it on 8 October 2026, for the month the reference kit's house was
// bought in and the months its points span, the latest published being
// July 2026. The months between are left out, since nothing reads them:
// a month takes the latest published at or before it. For tests.
export const quoted = [
  ["2022-06", 531987],
  ["2026-03", 522177],
  ["2026-04", 518323],
  ["2026-05", 519576],
  ["2026-06", 514630],
  ["2026-07", 515191],
] as const satisfies readonly (readonly [string, number])[];

// The Registry's answer for the months quoted, as a test writes it: each
// month with its average price for a detached house, and as much of the
// rest of the answer as shows the shape, on a buffer as a response's
// body is. For tests.
export function registryAnswer(
  months: readonly (readonly [string, number])[],
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify({
      format: "linked-data-api",
      result: {
        items: months.map(([refMonth, price]) => ({
          _about: `http://landregistry.data.gov.uk/data/ukhpi/region/dorset/month/${refMonth}`,
          averagePriceDetached: price,
          refMonth,
        })),
        itemsPerPage: 200,
        totalResults: months.length,
      },
      version: "0.2",
    }),
  );
}
