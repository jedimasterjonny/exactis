import type { Account } from "@/data/accounts";
import type { HouseValues } from "@/data/houses";

import { accounts } from "@/data/accounts.fixture";

const [, , , home, mortgage] = accounts;

// The reference kit's house as its dialog takes it: bought in June 2022
// for £380,000, worth £416,386, growing at 2.1%, with £341,810 owed on
// it at 5.15% and £2,210 paid a month, which clears it in 21.2 years.
// For tests.
export const homeValues: HouseValues = {
  balance: 341810,
  bought: { month: { month: 5, year: 2022 }, price: 380000 },
  growth: 0.021,
  name: "Home",
  payment: 2210,
  rate: 0.0515,
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
