import type { Condition } from "@/data/milestones";

import { atAge } from "@/data/milestones";

// An owner is one of the people the plan is for, whose ISAs and
// pensions are paid under their own allowances. The id is the owner's
// identity, handed out by the store, so an account names its owner
// rather than a name two owners could share, and the owners are listed
// in the order they were added. The plan is the first listed owner's:
// it runs to the age they reach, and the retirement its lines are tied
// to is theirs, as the first listed account is the first paid.
export interface Owner extends OwnerValues {
  readonly id: number;
}

// The owner as its dialog holds it, which is the owner less its id: the
// name the accounts screen lists an owner by, the year they were born,
// which turns a year of the plan into an age of theirs, and their
// retirement, from which they earn nothing by working, held as a
// milestone's conditions are: one on the age, for a retirement reached
// at an age. The years of National Insurance they have qualified for
// the State Pension on are absent rather than nothing until they are
// typed, as the model has them, and are typed on the assumptions screen
// rather than in the dialog.
export interface OwnerValues {
  readonly born: number;
  readonly name: string;
  readonly qualifyingYears?: number;
  readonly retirement: readonly Condition[];
}

// The most qualifying years an owner holds: more than a working life
// holds, and more than earn anything, since the full State Pension is
// earned on fewer. The figure typing them and the store keeping them
// hold them to the same.
export const mostQualifyingYears = 50;

// The owner a household opens with, before anyone is named: "Me", born
// in 1990 and retiring at 59, the ages the dashboard has shown, so a
// plan is somebody's from its first read. A new owner's dialog opens on
// the same years, with no name.
export const openingOwner: OwnerValues = {
  born: 1990,
  name: "Me",
  retirement: atAge(59),
};
