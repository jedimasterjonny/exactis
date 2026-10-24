import type { Child } from "@/data/children";

// Three children, with the ids a store would have given them, past every
// id the household fixture's records hold: one born in March 2015, one
// in October 2016 and one expected in May 2028, either side of the
// September a school year starts in. For tests. A tuple, so a test
// reading a child by its place gets one.
export const children = [
  { born: { month: 2, year: 2015 }, id: 20, name: "Ada" },
  { born: { month: 9, year: 2016 }, id: 21, name: "Finn" },
  { born: { month: 4, year: 2028 }, id: 22, name: "Cleo" },
] as const satisfies readonly Child[];
