import type { Account, Move } from "@/data/accounts";
import type { HouseValues, Part } from "@/data/houses";

import { accounts } from "@/data/accounts.fixture";

const [, , , home, mortgage] = accounts;

// The reference kit's mortgage as one sub-account: £341,810 owed at
// 5.15% and £2,210 paid a month, which clears it in 21.2 years. For
// tests.
export const homePart: Part = { balance: 341810, payment: 2210, rate: 0.0515 };

// The reference kit's house as its dialog takes it: bought in June 2022
// for £380,000, worth £416,386, growing at 2.1% with no ceiling, with
// the mortgage above against it. For tests.
export const homeValues: HouseValues = {
  bought: { month: { month: 5, year: 2022 }, price: 380000 },
  ceiling: 0,
  growth: 0.021,
  name: "Home",
  parts: [homePart],
  status: "mortgaged",
  value: 416386,
};

// The accounts fixture's home as the house it is, bought as above, with
// its mortgage secured on it: worth £416,386 with £182,940 owed, paying
// £2,210 a month. For tests.
export const house: Account = {
  ...home,
  bought: homeValues.bought,
  kind: "house",
};

export const houseLoan: Account = { ...mortgage, secures: home.id };

// A move up as the children leave home, at 46, to a house costing
// £650,000 today, held to a ceiling of £800,000, bought with what the
// home leaves and a mortgage of up to 90% of the price at 4.5% over 25
// years. For tests.
export const move: Move = {
  at: 1,
  ceiling: 800000,
  mortgage: { loanToValue: 0.9, rate: 0.045, term: 25 },
  price: 650000,
  year: 2036,
};
