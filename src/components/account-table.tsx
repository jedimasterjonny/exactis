import type { JSX } from "react";

import type {
  Account,
  AccountKind,
  Cadence,
  Contribution,
  Growth,
} from "@/data/accounts";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatGbp } from "@/lib/money";

interface AccountTableProps {
  readonly accounts: readonly Account[];
}

type Treatment = "destructive" | "secondary";

const cadences: Record<Cadence, string> = { month: "mo", year: "yr" };

// A rate is shown to two places, so 0 reads 0.00% and 0.021 reads 2.10%.
const percent = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "percent",
});

// The kind's label and the badge tone it takes. Only a debt is coloured,
// and it takes the loss tone, as its balance does everywhere else.
const treatments: Record<
  AccountKind,
  { readonly label: string; readonly variant: Treatment }
> = {
  cash: { label: "Cash", variant: "secondary" },
  debt: { label: "Debt", variant: "destructive" },
  "real-asset": { label: "Real asset", variant: "secondary" },
  "tax-deferred": { label: "Tax-deferred", variant: "secondary" },
  "tax-free": { label: "Tax-free", variant: "secondary" },
};

// A ledger of accounts: the name and its balance carry the weight, the
// treatment is a badge, and the three figures are right-aligned mono. The
// edit column, the row click and the dialog they open wait for the dialog.
export function AccountTable({ accounts }: AccountTableProps): JSX.Element {
  return (
    <Card className="py-0">
      <Table className="[&_td]:px-4 [&_th]:px-4">
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead>Treatment</TableHead>
            <TableHead className="text-right">Contribution</TableHead>
            <TableHead className="text-right">Growth</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.name}>
              <TableCell className="font-medium">{account.name}</TableCell>
              <TableCell>
                <Badge variant={treatments[account.kind].variant}>
                  {treatments[account.kind].label}
                </Badge>
              </TableCell>
              <TableCell className="text-right figure">
                {formatContribution(account.contribution)}
              </TableCell>
              <TableCell className="text-right figure">
                {formatGrowth(account.growth)}
              </TableCell>
              <TableCell className="text-right figure font-medium">
                {formatGbp(account.balance)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// An account with nothing paid in shows a flat dash, as a flat delta does.
function formatContribution(contribution: Contribution | undefined): string {
  if (contribution === undefined) {
    return "—";
  }
  return `${formatGbp(contribution.amount)} / ${cadences[contribution.cadence]}`;
}

function formatGrowth(growth: Growth): string {
  switch (growth.kind) {
    case "fixed":
      return percent.format(growth.rate);
    case "plan":
      return "Plan rate";
  }
}
