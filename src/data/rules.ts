// The words a rule is refused in where the model and the engine both
// hold it: the model where a save would break it, the engine where a
// household that broke it reached the engine anyway, which only a bug
// could hand it. The two say the same thing in the same words, so a
// refusal read off either is the one rule, and the words are kept once
// so the two cannot drift. A rule the model alone holds, the engine
// running soundly on a household that breaks it, is kept here when it
// extends one the two share, so the pair reads as one rule.
export const rules = {
  aboveBalloon: "A debt paid its own sum owes more than its balloon",
  belongs: "An ISA or a pension belongs to an owner the household lists",
  belowNothing: "A balance below nothing is a debt's",
  beyondGain: "A rate is no more than 50%",
  beyondLoss: "A rate loses no more than everything",
  borrowsOnLoan: "A move borrows on a loan already secured on the house",
  debtEnds: "A debt's payments end",
  droppable: "Only a pension is dropped when short",
  earner: "An income line is earned by an owner the plan lists",
  feedsPension: "A salary feeds a pension alone",
  floored: "An employer's minimum is a share of the base",
  inflation: "Inflation is a rate, and prices fall by less than everything",
  listedOnce: "An account is listed once",
  matched: "An employer matches a share of the base",
  owes: "A debt's balance is nothing or less",
  owned: "An ISA or a pension belongs to an owner, and nothing else",
  paysDebt: "A line pays a debt alone",
  paysSomething: "A line paying a debt pays something",
  retiresAtAge: "Only the plan's owner retires when conditions hold",
  share: "A salary gives up a share of its base",
  somebodys: "A plan is somebody's",
  spare: "A real asset or a debt takes no spare money",
} as const;
