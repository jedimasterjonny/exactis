// What a securities account held in cash and was paid, as last
// imported from Portfolio Performance: the account's name, as Portfolio
// Performance names it; the whole pounds its cash account held,
// uninvested; and what was paid into that cash account each day
// anything was, less what was taken out, in whole pounds by the ISO
// date, earliest first.
export interface Portfolio {
  readonly cash: number;
  readonly name: string;
  readonly paid: readonly Paid[];
}

// A category of the target allocation, as Portfolio Performance's Asset
// Allocation taxonomy holds it: a class with none beneath it. Its id is
// the one Portfolio Performance gives the class, which a file saved
// again keeps, and its name is the class's. The classes it sits beneath
// are named from the top down, and are none for a class at the top. Its
// share is a fraction of the whole: its weight in its parent, times the
// parent's in its own, and so on up the taxonomy. It is implemented
// when a holding is assigned to it, and a category nothing is assigned
// to is not, however much of the whole it asks for. What it holds is
// the securities assigned to it at the price the file last held them
// at, in whole pounds, or nothing for a category imported before what
// it holds was read, or whose holdings the reader does not price. Beside
// it is what each securities account holds of the category the same
// way, an account holding none of it left out; a category imported
// before that was read carries none.
export interface Target {
  readonly accounts?: readonly Held[];
  readonly classes: readonly string[];
  readonly id: string;
  readonly isImplemented: boolean;
  readonly name: string;
  readonly share: number;
  readonly value: number;
}

// The target allocation as last imported from Portfolio Performance:
// its categories in the order the file gives them, the day it was
// imported on, as an ISO date, and each securities account's cash and
// what was paid into it, which an allocation imported before they were
// read carries none of.
export interface Targets {
  readonly categories: readonly Target[];
  readonly importedOn: string;
  readonly portfolios?: readonly Portfolio[];
}

// What a securities account holds of a category: the account's name,
// as Portfolio Performance names it, and the whole pounds.
interface Held {
  readonly name: string;
  readonly value: number;
}

// What was paid into a cash account on a day, less what was taken out:
// the whole pounds, and the day, as an ISO date.
interface Paid {
  readonly amount: number;
  readonly on: string;
}
