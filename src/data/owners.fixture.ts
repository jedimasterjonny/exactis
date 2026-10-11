import type { Owner } from "@/data/owners";

// The owner the accounts fixture's wrappers belong to, with the id a
// store would have given it: born in 1992 and retiring at 61, the ages
// the reference plan runs on. For tests. A tuple, so a test reading the
// owner by its place gets one.
export const owners = [
  { born: 1992, id: 1, name: "Me", retires: 61 },
] as const satisfies readonly Owner[];

// A second owner, holding nothing, three years younger and retiring at
// the same age, for a choice of two. For tests.
export const sam = {
  born: 1995,
  id: 2,
  name: "Sam",
  retires: 61,
} as const satisfies Owner;

// The first owner retiring at 92, past the end of a plan to 91, so a
// salary runs as long as its line says. For tests.
export const working = { ...owners[0], retires: 92 } as const satisfies Owner;
