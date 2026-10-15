import type { Owner } from "@/data/owners";

import { atAge } from "@/data/milestones";

// The owner the accounts fixture's wrappers belong to, with the id a
// store would have given it: born in 1990 and retiring at 59, the ages
// the reference plan runs on. For tests. A tuple, so a test reading the
// owner by its place gets one.
export const owners = [
  { born: 1990, id: 1, name: "Me", retirement: atAge(59) },
] as const satisfies readonly Owner[];

// A second owner, holding nothing, three years younger and retiring at
// the same age, for a choice of two. For tests.
export const sam = {
  born: 1993,
  id: 2,
  name: "Sam",
  retirement: atAge(59),
} as const satisfies Owner;

// The first owner retiring at 90, past the end of a plan to 89, so a
// salary runs as long as its line says. For tests.
export const working = {
  ...owners[0],
  retirement: atAge(90),
} as const satisfies Owner;
