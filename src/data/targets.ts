// A category of the target allocation, as Portfolio Performance's Asset
// Allocation taxonomy holds it: a class with none beneath it. Its id is
// the one Portfolio Performance gives the class, which a file saved
// again keeps, and its name is the class's. The classes it sits beneath
// are named from the top down, and are none for a class at the top. Its
// share is a fraction of the whole: its weight in its parent, times the
// parent's in its own, and so on up the taxonomy. It is implemented
// when a holding is assigned to it, and a category nothing is assigned
// to is not, however much of the whole it asks for.
export interface Target {
  readonly classes: readonly string[];
  readonly id: string;
  readonly isImplemented: boolean;
  readonly name: string;
  readonly share: number;
}

// The target allocation as last imported from Portfolio Performance:
// its categories in the order the file gives them, and the day it was
// imported on, as an ISO date.
export interface Targets {
  readonly categories: readonly Target[];
  readonly importedOn: string;
}
