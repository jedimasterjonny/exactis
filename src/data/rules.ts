// The words a rule is refused in where the model and the engine both
// hold it: the model where a save would break it, the engine where a
// household that broke it reached the engine anyway, which only a bug
// could hand it. The two say the same thing in the same words, so a
// refusal read off either is the one rule, and the words are kept once
// so the two cannot drift.
export const rules = {
  alwaysFunded: "Only a pension is always funded",
  belowNothing: "A balance below nothing is a debt's",
  beyondLoss: "A rate loses no more than everything",
  debtEnds: "A debt's payments end",
  feedsPension: "A salary feeds a pension alone",
  inflation: "Inflation is a rate, and prices fall by less than everything",
  listedOnce: "An account is listed once",
  owes: "A debt's balance is nothing or less",
  owned: "An ISA or a pension belongs to an owner, and nothing else",
  paysDebt: "A line pays a debt alone",
  share: "A salary gives up a share of its base",
  spare: "A real asset or a debt takes no spare money",
} as const;
