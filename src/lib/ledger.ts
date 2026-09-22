import type { Account, Growth } from "@/data/accounts";

import { allowanceOf } from "@/data/accounts";
import { cadenceAbbreviations } from "@/lib/cadence";
import { formatGbp, formatPercent } from "@/lib/money";

// An account with nothing paid in shows a flat dash, as a flat delta does.
// One paid the spare money says the most it takes a year, which is its
// own allowance when it was given no cap.
export function formatContribution(account: Account): string {
  const { contribution } = account;
  if (contribution === undefined) {
    return "—";
  }
  switch (contribution.kind) {
    case "fixed":
      return `${formatGbp(contribution.amount)} / ${cadenceAbbreviations[contribution.cadence]}`;
    case "spare": {
      const cap = contribution.cap ?? allowanceOf(account.kind);
      return cap === null
        ? "Spare, uncapped"
        : `Spare, to ${formatGbp(cap)} / yr`;
    }
  }
}

// A growth is the account's own rate, or the plan's, set once on the
// assumptions screen.
export function formatGrowth(growth: Growth): string {
  switch (growth.kind) {
    case "fixed":
      return formatPercent(growth.rate);
    case "plan":
      return "Plan rate";
  }
}
