import type { Milestone } from "@/data/milestones";

// The milestones the reference plan turns on besides retirement, with
// the ids a store would have given them: the children leaving home the
// year after the childcare ends, and a downsize past retirement. For
// tests. A tuple, so a test reading a milestone by its place gets one.
export const milestones = [
  { id: 1, name: "Kids leave home", year: 2036 },
  { id: 2, name: "Downsize", year: 2055 },
] as const satisfies readonly Milestone[];
