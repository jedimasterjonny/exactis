import type { Account } from "@/data/accounts";
import type { CarValues } from "@/data/cars";

// A Golf worth £18,000 and losing 15% a year, with £14,000 owed on it
// at 7.9% on a PCP paying £290 a month towards a £6,000 balloon, which
// it reaches in three years and, carried on, clears in 4.9: as its
// dialog takes it, and as the store holds it under the ids after the
// reference household's, the car and the finance secured on it. For
// tests.
export const golfValues: CarValues = {
  agreement: "pcp",
  balance: 14000,
  balloon: 6000,
  depreciation: 0.15,
  name: "Golf",
  payment: 290,
  rate: 0.079,
  value: 18000,
};

export const golf: Account = {
  balance: 18000,
  growth: { kind: "fixed", rate: -0.15 },
  id: 6,
  kind: "car",
  name: "Golf",
};

// The same finance as a loan, which £438 a month clears in three years
// with no balloon to leave, and as the PCP.
export const golfLoan: Account = {
  balance: -14000,
  contribution: { amount: 438, cadence: "month", kind: "fixed" },
  growth: { kind: "fixed", rate: 0.079 },
  id: 7,
  kind: "debt",
  name: "Golf loan",
  secures: golf.id,
};

export const golfPcp: Account = {
  ...golfLoan,
  balloon: 6000,
  contribution: { amount: 290, cadence: "month", kind: "fixed" },
  name: "Golf PCP",
};
