import type { Account } from "@/data/accounts";
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
