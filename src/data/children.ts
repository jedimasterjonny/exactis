import type { Month } from "@/data/schedule";

// A child of the household, one of the people the plan is made around
// rather than for: no account is theirs and no line is earned by them.
// The id is the child's identity, handed out by the store as every
// record's is, and the children are listed in the order they were
// added.
export interface Child extends ChildValues {
  readonly id: number;
}

// The child as its dialog holds it, which is the child less its id: the
// name the accounts screen lists them by, and the month they were born
// in, which may be one still to come, for a child expected.
export interface ChildValues {
  readonly born: Month;
  readonly name: string;
}
