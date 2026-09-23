import type { Owner } from "@/data/owners";

// The owner the accounts fixture's wrappers belong to, with the id a
// store would have given it. For tests. A tuple, so a test reading the
// owner by its place gets one.
export const owners = [
  { id: 1, name: "Me" },
] as const satisfies readonly Owner[];
