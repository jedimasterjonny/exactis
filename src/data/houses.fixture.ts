import type { Account, Move } from "@/data/accounts";
import type { HouseValues, Part } from "@/data/houses";

import { accounts } from "@/data/accounts.fixture";

const [, , , home, mortgage] = accounts;

// The reference kit's mortgage as one sub-account: £334,670 owed at
// 4.85% and £2,180 paid a month, which clears it in 20.0 years. For
// tests.
export const homePart: Part = { balance: 334670, payment: 2180, rate: 0.0485 };

// The reference kit's house as its dialog takes it: bought in October
// 2021 for £380,000, worth £397,512, growing at 2.1% with no ceiling, with
// the mortgage above against it. For tests.
export const homeValues: HouseValues = {
  bought: { month: { month: 9, year: 2021 }, price: 380000 },
  ceiling: 0,
  growth: 0.021,
  move: null,
  name: "Home",
  parts: [homePart],
  status: "mortgaged",
  value: 397512,
};

// The accounts fixture's home as the house it is, bought as above, with
// its mortgage secured on it: worth £397,512 with £176,520 owed, paying
// £2,180 a month. For tests.
export const house: Account = {
  ...home,
  bought: homeValues.bought,
  kind: "house",
};

export const houseLoan: Account = { ...mortgage, secures: home.id };

// A move up as the children leave home, at 48, to a house costing
// £650,000 today, held to a ceiling of £800,000, bought with what the
// home leaves and a mortgage of up to 90% of the price at 4.5% over 25
// years. For tests.
export const move: Move = {
  at: 7,
  ceiling: 800000,
  mortgage: { loanToValue: 0.9, rate: 0.045, term: 25 },
  price: 650000,
  year: 2040,
};
