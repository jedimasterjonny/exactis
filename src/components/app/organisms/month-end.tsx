"use client";

import type { JSX } from "react";

import { CalendarCheck, Check } from "lucide-react";
import { useState } from "react";

import type { Account } from "@/data/accounts";
import type { Plan } from "@/data/plan";
import type { Month } from "@/data/schedule";
import type { Schedule } from "@/engine/cash-flow";

import { closeBalances } from "@/actions/accounts";
import { DialogFrame } from "@/components/app/atoms/dialog-frame";
import { Field } from "@/components/app/atoms/field";
import { FieldRow } from "@/components/app/atoms/field-row";
import { Ledger } from "@/components/app/atoms/ledger";
import { Note } from "@/components/app/atoms/note";
import { RowAction } from "@/components/app/atoms/row-action";
import { MoneyInput, YearField } from "@/components/app/molecules/figure-field";
import { MonthField } from "@/components/app/molecules/month-field";
import { Button } from "@/components/kit/button";
import { balanceGroups } from "@/data/accounts";
import { monthsOn } from "@/engine/projection";
import { useSender } from "@/hooks/use-sender";
import { counted } from "@/lib/count";
import { formatGbp, negated } from "@/lib/money";
import { formatDated, formatMonth, monthsBetween } from "@/lib/months";

// The worksheet while it is open: the month the balances are being
// closed onto, the balances checked, and the figures typed, by the
// account's id. A balance not typed reads what the plan expected.
interface Draft {
  readonly asOf: Month;
  readonly checked: ReadonlySet<number>;
  readonly typed: ReadonlyMap<number, number>;
}

interface MonthEndProps {
  readonly accounts: readonly Account[];
  readonly month: Month;
  readonly plan: Plan;
  readonly schedule: Schedule;
  readonly today: string;
}

// What a row says of a balance: what it was, what the months were
// planned to pay into it, or off it for a debt, and what it reads now.
interface Row {
  readonly account: Account;
  readonly isChecked: boolean;
  readonly now: number;
  readonly paid: number;
}

// The month end: the header's button, which opens a worksheet of every
// balance closed onto the month it is, or another month picked. Each
// balance opens at what the plan expected it to reach by then, as the
// projection carries it over the months from the one the balances are
// as of, so a loan, whose payments and interest the plan knows, is
// usually only checked, and a saving is typed from its statement. A
// balance typed is checked by the typing; one confirmed as it reads is
// checked by its press. Only the balances checked are saved, each dated
// today, with the month, in one version; every other balance keeps what
// it held and the day it was set, so the worksheet never makes up a
// balance nobody read. A debt is written below nothing, as its balance
// is, and one typed above nothing is taken as what is owed, since a
// statement says what is owed rather than its sign. Beneath each balance
// the worksheet says what it was and what was planned to be paid in, or
// paid off a debt, then, once it is checked, what moved it besides,
// which is the rest of the difference, and before that the day it was
// last set. The worksheet closes on the starting net worth the month
// leaves, ruled off from what the balances were, what was paid in and
// what moved, over the balances checked; the footer counts them. A
// store that refuses leaves the worksheet open and says why. The year
// picked is held between the year the plan's owner was born and the
// one it is, which are the months the store takes, so a year mistyped
// asks the plan for no more months than it has. The day it is is given
// rather than read, so the ages draw the same on the server as in a
// test, and so is the month it is.
export function MonthEnd({
  accounts,
  month,
  plan,
  schedule,
  today,
}: MonthEndProps): JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null);
  const { isSending: isSaving, send } = useSender();
  const from: Month = { month: plan.month, year: plan.from };

  function open(): void {
    setDraft({ asOf: month, checked: new Set(), typed: new Map() });
  }

  return (
    <>
      <Button onClick={open} size="sm">
        <CalendarCheck aria-hidden />
        Update balances
      </Button>
      {draft !== null && (
        <Worksheet
          accounts={accounts}
          draft={draft}
          from={from}
          isSaving={isSaving}
          month={month}
          onAmend={setDraft}
          onDismiss={() => {
            setDraft(null);
          }}
          onSave={(rows) => {
            const checked = rows.filter(({ isChecked }) => isChecked);
            send(
              async () =>
                closeBalances({
                  asOf: draft.asOf,
                  balances: checked.map(({ account, now }) => ({
                    balance: Math.round(now),
                    id: account.id,
                  })),
                }),
              {
                failure: "Balances not saved",
                onAccepted: () => {
                  setDraft(null);
                },
                success: (saved) => ({
                  description: `${counted(checked.length, "balance")} set as of ${formatMonth(saved)}`,
                  title: "Balances updated",
                }),
              },
            );
          }}
          plan={plan}
          schedule={schedule}
          today={today}
        />
      )}
    </>
  );
}

// A balance's field: its account's name over the figure it reads now
// and the press that checks it, and beneath them what it was, what the
// months paid into it and, once checked, what moved it, or until then
// the day it was last set.
function Balance({
  onCheck,
  onType,
  row,
  today,
}: {
  readonly onCheck: (account: Account, isChecked: boolean) => void;
  readonly onType: (account: Account, value: number) => void;
  readonly row: Row;
  readonly today: string;
}): JSX.Element {
  const { account, isChecked, now, paid } = row;
  const verb = account.kind === "debt" ? "paid off" : "paid in";
  const since =
    account.setOn === undefined
      ? "not dated"
      : `set ${formatDated(account.setOn, today)}`;
  const facts = [
    `Was ${formatGbp(account.balance)}`,
    paid === 0 ? `nothing ${verb}` : `${formatGbp(paid)} ${verb}`,
    isChecked ? `${pounds(now - account.balance - paid)} moved` : since,
  ];
  return (
    <Field hint={facts.join(" · ")} label={account.name}>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <MoneyInput
            onValueCommitted={(value) => {
              onType(account, value);
            }}
            value={now}
          />
        </div>
        <RowAction
          aria-pressed={isChecked}
          className={isChecked ? "text-positive" : "text-muted-foreground"}
          icon={Check}
          name={`Check ${account.name}`}
          onClick={() => {
            onCheck(account, !isChecked);
          }}
        />
      </div>
    </Field>
  );
}

// A sum that can come to a fraction of a pound either side of nothing,
// to the pound, nothing written as nothing rather than as minus nothing.
function pounds(amount: number): string {
  const whole = Math.round(amount);
  return formatGbp(whole === 0 ? 0 : whole);
}

// What a balance reads now: what was typed, a debt's below nothing, and
// a debt typed as nothing as nothing rather than as minus nothing.
function typedAs(account: Account, value: number): number {
  return account.kind === "debt" ? negated(Math.abs(value)) : value;
}

// The open worksheet: the month, a field a balance in its group, and
// the net worth the month leaves, between the title and the footer.
function Worksheet({
  accounts,
  draft,
  from,
  isSaving,
  month,
  onAmend,
  onDismiss,
  onSave,
  plan,
  schedule,
  today,
}: {
  readonly accounts: readonly Account[];
  readonly draft: Draft;
  readonly from: Month;
  readonly isSaving: boolean;
  readonly month: Month;
  readonly onAmend: (draft: Draft) => void;
  readonly onDismiss: () => void;
  readonly onSave: (rows: readonly Row[]) => void;
  readonly plan: Plan;
  readonly schedule: Schedule;
  readonly today: string;
}): JSX.Element {
  const months = Math.max(0, monthsBetween(from, draft.asOf));
  const rows = monthsOn(accounts, schedule, { months, plan }).map(
    ({ account, balance, paid }): Row => ({
      account,
      isChecked: draft.checked.has(account.id),
      now: draft.typed.get(account.id) ?? Math.round(balance),
      paid,
    }),
  );
  const checked = rows.filter(({ isChecked }) => isChecked);
  const was = rows.reduce((sum, { account }) => sum + account.balance, 0);
  const paid = checked.reduce((sum, row) => sum + row.paid, 0);
  const moved = checked.reduce(
    (sum, row) => sum + row.now - row.account.balance - row.paid,
    0,
  );

  function check(account: Account, isChecked: boolean): void {
    const next = new Set(draft.checked);
    if (isChecked) {
      next.add(account.id);
    } else {
      next.delete(account.id);
    }
    onAmend({ ...draft, checked: next });
  }

  function type(account: Account, value: number): void {
    onAmend({
      ...draft,
      checked: new Set(draft.checked).add(account.id),
      typed: new Map(draft.typed).set(account.id, typedAs(account, value)),
    });
  }

  return (
    <DialogFrame
      className="sm:max-w-3xl"
      eyebrow="Month end"
      footer={
        <>
          <span className="mr-auto self-center text-sm text-muted-foreground">
            {`${String(checked.length)} of ${String(rows.length)} checked`}
          </span>
          <Button onClick={onDismiss} size="sm" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={isSaving}
            onClick={() => {
              onSave(rows);
            }}
            size="sm"
          >
            Save
          </Button>
        </>
      }
      onDismiss={onDismiss}
      title={`Balances for ${formatMonth(draft.asOf)}`}
    >
      <FieldRow layout="pair">
        <MonthField
          label="Month"
          onValueChange={(picked) => {
            onAmend({ ...draft, asOf: { ...draft.asOf, month: picked } });
          }}
          value={draft.asOf.month}
        />
        <YearField
          label="Year"
          max={month.year}
          min={plan.born}
          onValueCommitted={(year) => {
            onAmend({ ...draft, asOf: { ...draft.asOf, year } });
          }}
          value={draft.asOf.year}
        />
      </FieldRow>
      <Note>
        Each balance opens at what the plan expected of it. Check one that
        matches its statement, or type what the statement says. Only the
        balances checked are saved, each dated today; the rest keep what they
        held and the day they were set.
      </Note>
      {balanceGroups.map(({ holds, name }) => {
        const held = rows.filter(({ account }) => holds(account));
        return (
          held.length > 0 && (
            <div
              aria-label={name}
              className="grid gap-3"
              key={name}
              role="group"
            >
              <h3 className="label text-muted-foreground">{name}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {held.map((row) => (
                  <Balance
                    key={row.account.id}
                    onCheck={check}
                    onType={type}
                    row={row}
                    today={today}
                  />
                ))}
              </div>
            </div>
          )
        );
      })}
      <Ledger
        steps={[
          {
            detail: `The starting net worth as of ${formatMonth(from)}`,
            figure: formatGbp(was),
            label: "As the balances stood",
          },
          {
            detail: "What the plan paid into the balances checked, or off them",
            figure: formatGbp(paid),
            label: "Paid in",
          },
          {
            detail: "Markets, interest, and whatever the plan did not expect",
            figure: pounds(moved),
            label: "Moved",
          },
        ]}
        total={formatGbp(was + paid + moved)}
        totalName={`Starting net worth for ${formatMonth(draft.asOf)}`}
      />
    </DialogFrame>
  );
}
