// An invented average price for a detached house, as the Land Registry
// would give it, for the month the reference kit's house was bought in
// and the months its points span, the latest published being July
// 2026. The months between are left out, since nothing reads them:
// a month takes the latest published at or before it. For tests.
export const quoted = [
  ["2021-10", 287540],
  ["2026-03", 283105],
  ["2026-04", 280860],
  ["2026-05", 281470],
  ["2026-06", 278215],
  ["2026-07", 278940],
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
          _about: `http://landregistry.data.gov.uk/data/ukhpi/region/shropshire/month/${refMonth}`,
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
