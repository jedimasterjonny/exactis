import type { Account } from "@/data/accounts";
import type { HouseValues } from "@/data/houses";

import { accounts } from "@/data/accounts.fixture";

const [, , , home, mortgage] = accounts;

// The reference kit's house as its dialog takes it: worth £397,512,
// growing at 2.1%, with £334,670 owed on it at 4.85% and £2,180 paid a
// month, which clears it in 20.0 years. For tests.
export const homeValues: HouseValues = {
  balance: 334670,
  growth: 0.021,
  name: "Home",
  payment: 2180,
  rate: 0.0485,
  status: "mortgaged",
  value: 397512,
};

// The accounts fixture's home as the house it is, with its mortgage
// secured on it: worth £397,512 with £176,520 owed, paying £2,180 a
// month. For tests.
export const house: Account = { ...home, kind: "house" };

export const houseLoan: Account = { ...mortgage, secures: home.id };
