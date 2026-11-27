"use client";

import type { JSX } from "react";

import { Square, SquareCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import * as z from "zod";

import type { Account } from "@/data/accounts";
import type { Plan } from "@/data/plan";
import type { Month } from "@/data/schedule";
import type { Schedule } from "@/engine/cash-flow";
import type { MonthEndPortfolio } from "@/lib/portfolio-balances";
import type { Slot } from "@/lib/slot";

import { closeBalances } from "@/actions/accounts";
import { Field } from "@/components/app/atoms/field";
import { FieldRow } from "@/components/app/atoms/field-row";
import { Ledger } from "@/components/app/atoms/ledger";
import { Note } from "@/components/app/atoms/note";
import { RowAction } from "@/components/app/atoms/row-action";
import { MoneyInput, YearField } from "@/components/app/molecules/figure-field";
import { MonthField } from "@/components/app/molecules/month-field";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Button } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import { balanceGroups } from "@/data/accounts";
import { month as aMonth, recordId } from "@/data/schemas";
import { monthsOn } from "@/engine/projection";
import { useSender } from "@/hooks/use-sender";
import { counted } from "@/lib/count";
import { formatGbp, negated } from "@/lib/money";
import {
  cutOf,
  formatDated,
  formatDay,
  monthBefore,
  monthsBetween,
} from "@/lib/months";
import { monthEnd, subsectionLabel } from "@/lib/nav";
import { evaluatePrefillForMonth } from "@/lib/portfolio-balances";

// The worksheet while it is open: the month the balances are being
// closed onto, the balances checked, and the figures typed, by the
// account's id. A balance not typed reads what the plan expected.
interface Draft {
  readonly asOf: Month;
  readonly checked: ReadonlySet<number>;
  readonly typed: ReadonlyMap<number, number>;
}

// The draft held: what it is, the month cut last it was opened on, each
// account it touched, and whether it came back from the tab's storage.
interface Held {
  readonly draft: Draft;
  readonly isRestored: boolean;
  readonly month: Month;
  readonly touched: readonly Touched[];
}

interface MonthEndProps {
  readonly accounts: readonly Account[];
  readonly isUpdating: boolean;
  readonly month: Month;
  readonly plan: Plan;
  readonly portfolio?: MonthEndPortfolio | undefined;
  readonly schedule: Schedule;
  readonly sources?: Slot;
  readonly today: string;
}

type PortfolioRowEvaluation = ReturnType<typeof evaluatePrefillForMonth>;

interface PrefillTarget {
  readonly account: Account;
  readonly balance: number;
}

// What a row says of a balance: what it was, what the months were
// planned to pay into it, or off it for a debt, and what it reads now.
interface Row {
  readonly account: Account;
  readonly isChecked: boolean;
  readonly now: number;
  readonly paid: number;
}

// An account a draft touched, by its id, its kind and its name.
type Touched = readonly [id: number, kind: string, name: string];

// The one key a tab keeps the worksheet's draft under, so the next edit
// writes over a draft another month or household left.
const draftKey = "month-end-draft";

// The draft as the tab keeps it, read back, its sets kept as lists.
// Anything else is no draft.
const keptDraft = z.object({
  draft: z.object({
    asOf: aMonth,
    checked: z.array(recordId).transform((ids) => new Set(ids)),
    typed: z
      .array(z.tuple([recordId, z.number()]))
      .transform((figures) => new Map(figures)),
  }),
  month: aMonth,
  touched: z.array(z.tuple([recordId, z.string(), z.string()])),
});

// The month end's worksheet, the first card of its screen: every
// balance closed onto the month whose balances were cut last, or onto
// another month picked. Each balance opens at what the plan expected it
// to reach by then, as the projection carries it over the months from
// the plan's first through the month closed, so a loan, whose payments
// and interest the plan knows, is usually only checked, and a saving is
// typed from its statement. A
// balance typed is checked by the typing; one confirmed as it reads is
// checked by its press, and the rest of a group whose balances no
// statement gives, the property and vehicles or the loans, by one press
// for the group, which the savings, read from statements, are not
// offered. Only the balances checked are saved, each dated
// today, with the month, in one version; every other balance keeps what
// it held and the day it was set, so the worksheet never makes up a
// balance nobody read. A debt is written below nothing, as its balance
// is, and one typed above nothing is taken as what is owed, since a
// statement says what is owed rather than its sign. Beneath each balance
// the worksheet says what it was and what was planned to be paid in, or
// paid off a debt, then, once it is checked, what moved it besides,
// which is the rest of the difference, and before that the day it was
// last set. The worksheet closes on the balances the month leaves, as
// the statements have them, a pension at what it holds, ruled off from
// what they were, what was paid in and what moved, over the balances
// checked; the footer counts them. A store that refuses leaves the
// worksheet as it was and says why, and one that saves opens it afresh,
// so a month closed that leaves the screen where it was is not saved
// twice, or, while the balances are being updated, goes back to what
// moved. The draft is kept in the tab's storage as it is edited, with
// the month cut last it was opened on and each account it touched, by
// id, kind and name, so a reload, or a tab the browser put away, picks
// it up as it was left, under a note saying so beside a press that
// starts again. It lands whole or not at all: only while each account
// it touched is listed as it was, so one drawn again over an import
// whose accounts differ from those by id, kind or name, or over an
// account of its renamed or deleted, opens afresh, while one drawn over
// the same accounts imported, an account added, or a balance a pull
// moved, stands; and from storage only onto the month it was opened
// on. A draft with nothing checked or typed is not kept, and a save or
// a start again erases the copy, as a storage that refuses it does, so
// an older draft never outlives a newer one. The server cannot read the
// tab, so it and the hydration draw the worksheet as it opens, and the
// draft kept lands in the render after. The note stays until the draft
// is saved, started again or edited down to nothing, so the fields
// below it do not move as the first figure is typed.
// The year picked is held between the year the plan's owner was
// born and the year of the month cut last, which hold the months the
// store takes, so a year mistyped asks the plan for no more months than
// it has. The day it is is given rather than read, so the
// ages draw the same on the server as in a test, and so is the month
// the worksheet opens on. The sources the balances rest on, which the
// caller slots in, head the card, so they are pulled before the
// balances are checked.
export function MonthEnd({
  accounts,
  isUpdating,
  month,
  plan,
  portfolio,
  schedule,
  sources,
  today,
}: MonthEndProps): JSX.Element {
  const opened = (): Draft => ({
    asOf: month,
    checked: new Set(),
    typed: new Map(),
  });
  const stored = useSyncExternalStore(subscribe, readDraft, noDraft);
  const [announcement, setAnnouncement] = useState("");
  const [held, setHeld] = useState<Held | null>(null);
  const shown = held ?? restoredOf(stored, month);
  const isShown = shown !== null && isBound(shown, accounts);
  const draft = isShown ? shown.draft : opened();
  const isRestored = isShown && shown.isRestored;
  const { isSending: isSaving, send } = useSender();
  const router = useRouter();
  const from: Month = { month: plan.month, year: plan.from };
  const rows = rowsOf(accounts, draft, { from, plan, schedule });
  const checked = rows.filter(({ isChecked }) => isChecked);

  // The draft as edited, held and kept. Its note goes once nothing is
  // checked or typed, since no copy is kept then to say it of.
  function amend(next: Draft): void {
    const amended: Held = {
      draft: next,
      isRestored: isRestored && !isEmpty(next),
      month: isShown ? shown.month : month,
      touched: touchedOf(next, accounts),
    };
    setHeld(amended);
    keep(amended);
  }

  // The worksheet opened afresh, held empty rather than let go, so a
  // copy the storage refused to erase is not read back in its place.
  function drop(): void {
    const dropped: Held = {
      draft: opened(),
      isRestored: false,
      month,
      touched: [],
    };
    setAnnouncement("");
    setHeld(dropped);
    keep(dropped);
  }

  return (
    <SectionCard
      label={subsectionLabel(monthEnd, 1)}
      title={`Balances on ${formatDay(cutOf(draft.asOf))}`}
    >
      <CardContent className="grid gap-4">
        {sources}
        <Worksheet
          announcement={announcement}
          checked={checked}
          draft={draft}
          from={from}
          isRestored={isRestored}
          month={month}
          onAmend={amend}
          onAnnounce={setAnnouncement}
          onDrop={() => {
            drop();
            document.querySelector<HTMLElement>("h1")?.focus();
          }}
          plan={plan}
          portfolio={portfolio}
          rows={rows}
          today={today}
        />
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <span className="mr-auto text-sm text-muted-foreground">
          {`${String(checked.length)} of ${String(rows.length)} checked`}
        </span>
        <Button
          isBusy={isSaving}
          onClick={() => {
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
                  drop();
                  if (isUpdating) {
                    router.replace(monthEnd.href);
                  }
                },
                success: (saved) => ({
                  description: `${counted(checked.length, "balance")} set as of ${formatDay(cutOf(saved.asOf))}${saved.isRecorded ? ", its progress point recorded" : ""}`,
                  title: "Balances updated",
                }),
              },
            );
          }}
          size="sm"
        >
          Save
        </Button>
      </CardFooter>
    </SectionCard>
  );
}

// What a touch of the tab's storage, or of the text it kept, returns,
// or nothing where it throws: a storage over its quota, or turned off,
// which throws as `sessionStorage` is read or leaves it undefined, or
// text that is not JSON. The draft in state stays the worksheet's, so a
// refusal costs only the reload, and nothing is logged of it.
function attempt<T>(touch: () => T): T | undefined {
  try {
    return touch();
  } catch {
    return undefined;
  }
}

// A balance's field: its account's name over the figure it reads now
// and the press that checks it, and beneath them what it was, what the
// months paid into it and, once checked, what moved it, or until then
// the day it was last set. The press is an empty box until the balance
// is checked and a ticked one after: a tick in both, jade or grey, told
// them apart by colour alone, and not at all under the pointer, which
// turns either ink.
function Balance({
  onBindCheckButton,
  onCheck,
  onPrefill,
  onType,
  portfolioStatus,
  row,
  today,
}: {
  readonly onBindCheckButton: (
    id: number,
    element: HTMLButtonElement | null,
  ) => void;
  readonly onCheck: (account: Account, isChecked: boolean) => void;
  readonly onPrefill: (account: Account, balance: number) => void;
  readonly onType: (account: Account, value: number) => void;
  readonly portfolioStatus: PortfolioRowEvaluation | undefined;
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
    <div className="grid content-start gap-1">
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
            icon={isChecked ? SquareCheck : Square}
            name={`Check ${account.name}`}
            onClick={() => {
              onCheck(account, !isChecked);
            }}
            ref={(element) => {
              onBindCheckButton(account.id, element);
            }}
          />
        </div>
      </Field>
      {portfolioStatus !== undefined && (
        <PortfolioRowStatus
          onPrefill={onPrefill}
          row={row}
          status={portfolioStatus}
        />
      )}
    </div>
  );
}

// One group of balances (Savings, Property & vehicles, or Loans &
// debts): its header with Check the rest or warning-free Prefill from
// Portfolio, optional Portfolio group note, and balance rows.
function BalanceGroup({
  draft,
  held,
  isStated,
  month,
  name,
  onBindCheckButton,
  onCheck,
  onCheckRest,
  onPrefillGroup,
  onPrefillRow,
  onType,
  portfolio,
  today,
}: {
  readonly draft: Draft;
  readonly held: readonly Row[];
  readonly isStated: boolean;
  readonly month: Month;
  readonly name: string;
  readonly onBindCheckButton: (
    id: number,
    element: HTMLButtonElement | null,
  ) => void;
  readonly onCheck: (account: Account, isChecked: boolean) => void;
  readonly onCheckRest: (ids: readonly number[]) => void;
  readonly onPrefillGroup: (
    targets: readonly PrefillTarget[],
    firstId: number,
  ) => void;
  readonly onPrefillRow: (account: Account, balance: number) => void;
  readonly onType: (account: Account, value: number) => void;
  readonly portfolio: MonthEndPortfolio | undefined;
  readonly today: string;
}): JSX.Element {
  const unchecked = held.filter(({ isChecked }) => !isChecked);
  const statuses = new Map(
    held.map((row) => [
      row.account.id,
      portfolioStatusOf(row.account.id, portfolio, {
        asOf: draft.asOf,
        due: month,
      }),
    ]),
  );
  const prefillable = isStated
    ? prefillCandidatesOf(held, draft, statuses)
    : [];
  const [firstPrefillable] = prefillable;
  const isHistorical =
    isStated &&
    portfolio !== undefined &&
    monthsBetween(draft.asOf, month) !== 0;

  return (
    <div aria-label={name} className="grid gap-3" role="group">
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-4 gap-y-2 pointer-coarse:min-h-11">
        <h3 className="label text-muted-foreground">{name}</h3>
        {!isStated && unchecked.length > 0 && (
          <Button
            onClick={() => {
              onCheckRest(unchecked.map(({ account }) => account.id));
            }}
            size="xs"
            variant="outline"
          >
            Check the rest
          </Button>
        )}
        {firstPrefillable !== undefined && (
          <Button
            onClick={() => {
              onPrefillGroup(prefillable, firstPrefillable.account.id);
            }}
            size="xs"
            variant="outline"
          >
            Prefill from Portfolio
          </Button>
        )}
      </div>
      {isHistorical && (
        <Note>
          {`Portfolio holds current balances, not ${formatDay(cutOf(draft.asOf))}'s, so prefill is off for this month.`}
        </Note>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {held.map((row) => (
          <Balance
            key={row.account.id}
            onBindCheckButton={onBindCheckButton}
            onCheck={onCheck}
            onPrefill={onPrefillRow}
            onType={onType}
            portfolioStatus={statuses.get(row.account.id)}
            row={row}
            today={today}
          />
        ))}
      </div>
    </div>
  );
}

// Whether each account a draft touched is listed as it was, by id, kind
// and name.
function isBound({ touched }: Held, accounts: readonly Account[]): boolean {
  return touched.every(([id, kind, name]) =>
    accounts.some(
      (account) =>
        account.id === id && account.kind === kind && account.name === name,
    ),
  );
}

// Whether a draft has nothing checked or typed, as one opened afresh.
function isEmpty({ checked, typed }: Draft): boolean {
  return checked.size === 0 && typed.size === 0;
}

// Keeps a draft in the tab's storage for a reload, or erases the copy
// where the draft has nothing checked or typed, or where the storage
// refuses it, so an older draft never outlives a newer one.
function keep({ draft, month, touched }: Held): void {
  const isKept =
    !isEmpty(draft) &&
    (attempt(() => {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          draft: {
            asOf: draft.asOf,
            checked: [...draft.checked],
            typed: [...draft.typed],
          },
          month,
          touched,
        }),
      );
      return true;
    }) ??
      false);
  if (!isKept) {
    attempt(() => {
      sessionStorage.removeItem(draftKey);
    });
  }
}

// What the server reads of the tab's storage, which it cannot reach.
function noDraft(): null {
  return null;
}

// Portfolio balance prefill button, match confirmation, neutral info,
// and caution warnings rendered beneath a linked saving's Field.
function PortfolioRowStatus({
  onPrefill,
  row,
  status,
}: {
  readonly onPrefill: (account: Account, balance: number) => void;
  readonly row: Row;
  readonly status: PortfolioRowEvaluation;
}): JSX.Element | null {
  const warningId = useId();
  if (status.kind === "historical") {
    return null;
  }
  if (status.kind === "incomplete") {
    const label =
      status.portfolioName === row.account.name
        ? `Portfolio: ${status.reason}`
        : `${status.portfolioName} in Portfolio: ${status.reason}`;
    return (
      <p className="flex items-start gap-1.5 text-xs text-caution">
        <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0 wrap-anywhere">
          <span className="sr-only">Caution:</span> {label}
        </span>
      </p>
    );
  }
  const isMatching = row.now === status.balance;
  const matchLabel = row.isChecked
    ? "Matches Portfolio"
    : "Matches Portfolio · check to confirm";
  return (
    <div className="grid gap-1">
      <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs pointer-coarse:min-h-11">
        {isMatching ? (
          <span className="text-muted-foreground">
            {[matchLabel, ...status.info].join(" · ")}
          </span>
        ) : (
          <>
            <Button
              aria-describedby={
                status.warnings.length > 0 ? warningId : undefined
              }
              aria-label={`Use ${formatGbp(status.balance)} for ${row.account.name}`}
              onClick={() => {
                onPrefill(row.account, status.balance);
              }}
              size="xs"
              variant="outline"
            >
              {`Use ${formatGbp(status.balance)}`}
            </Button>
            {status.info.length > 0 && (
              <span className="text-muted-foreground">
                {status.info.join(" · ")}
              </span>
            )}
          </>
        )}
      </div>
      {status.warnings.length > 0 && (
        <p
          className="flex items-start gap-1.5 text-xs text-caution"
          id={warningId}
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 wrap-anywhere">
            <span className="sr-only">Caution:</span>{" "}
            {status.warnings.join(" · ")}
          </span>
        </p>
      )}
    </div>
  );
}

function portfolioStatusOf(
  accountId: number,
  portfolio: MonthEndPortfolio | undefined,
  months: { readonly asOf: Month; readonly due: Month },
): PortfolioRowEvaluation | undefined {
  const entry = portfolio?.byAccountId[accountId];
  return entry === undefined
    ? undefined
    : evaluatePrefillForMonth(entry, months);
}

// A sum that can come to a fraction of a pound either side of nothing,
// to the pound, nothing written as nothing rather than as minus nothing.
function pounds(amount: number): string {
  const whole = Math.round(amount);
  return formatGbp(whole === 0 ? 0 : whole);
}

function prefillCandidatesOf(
  held: readonly Row[],
  draft: Draft,
  statuses: ReadonlyMap<number, PortfolioRowEvaluation | undefined>,
): readonly PrefillTarget[] {
  const prefillable: PrefillTarget[] = [];
  for (const row of held) {
    const status = statuses.get(row.account.id);
    if (
      status?.kind !== "ready" ||
      !status.canGroupPrefill ||
      draft.typed.has(row.account.id) ||
      draft.checked.has(row.account.id) ||
      row.now === status.balance
    ) {
      continue;
    }
    prefillable.push({ account: row.account, balance: status.balance });
  }
  return prefillable;
}

// The draft the tab kept, as text, or none.
function readDraft(): null | string {
  return attempt(() => sessionStorage.getItem(draftKey)) ?? null;
}

// The draft the tab kept, where it reads back as one and was opened on
// the month given, as one restored; or none.
function restoredOf(text: null | string, month: Month): Held | null {
  if (text === null) {
    return null;
  }
  const { data } = keptDraft.safeParse(
    attempt((): unknown => JSON.parse(text)),
  );
  return data !== undefined && monthsBetween(data.month, month) === 0
    ? { ...data, isRestored: true }
    : null;
}

// A row a balance as the draft has it. Closing the end of a month
// carries every month from the plan's first through it, the one more
// than the months between them: the plan's first month alone closes its
// own end, and the month the balances are already as of, the one before
// the plan's first, carries none.
function rowsOf(
  accounts: readonly Account[],
  draft: Draft,
  {
    from,
    plan,
    schedule,
  }: { readonly from: Month; readonly plan: Plan; readonly schedule: Schedule },
): readonly Row[] {
  const months = Math.max(0, monthsBetween(from, draft.asOf) + 1);
  return monthsOn(accounts, schedule, { months, plan }).map(
    ({ account, balance, paid }): Row => ({
      account,
      isChecked: draft.checked.has(account.id),
      now: draft.typed.get(account.id) ?? Math.round(balance),
      paid,
    }),
  );
}

// The tab's storage tells no one of a change, and needs telling none:
// this tab writes every change itself, and another tab keeps a storage
// of its own. So the store is read on every render, the server's
// answering nothing, and nothing is subscribed to.
function subscribe(): () => void {
  return (): void => {
    // Nothing to unsubscribe from.
  };
}

// Each account a draft checked or typed, by id, kind and name.
function touchedOf(
  { checked, typed }: Draft,
  accounts: readonly Account[],
): readonly Touched[] {
  return accounts
    .filter(({ id }) => checked.has(id) || typed.has(id))
    .map(({ id, kind, name }): Touched => [id, kind, name]);
}

// What a balance reads now: what was typed, a debt's below nothing, and
// a debt typed as nothing as nothing rather than as minus nothing.
function typedAs(account: Account, value: number): number {
  return account.kind === "debt" ? negated(Math.abs(value)) : value;
}

// Drops unchecked Portfolio-prefilled balances when switching to a
// historical month so current Portfolio figures never carry onto an
// earlier cut, while preserving checked and manually typed figures.
function typedForMonth(
  draft: Draft,
  nextAsOf: Month,
  {
    due,
    portfolio,
  }: { readonly due: Month; readonly portfolio: MonthEndPortfolio | undefined },
): ReadonlyMap<number, number> {
  if (
    portfolio === undefined ||
    monthsBetween(nextAsOf, due) === 0 ||
    draft.typed.size === 0
  ) {
    return draft.typed;
  }
  const nextTyped = new Map(draft.typed);
  for (const [id, typedValue] of nextTyped) {
    const entry = portfolio.byAccountId[id];
    if (
      !draft.checked.has(id) &&
      entry?.kind === "ready" &&
      entry.balance === typedValue
    ) {
      nextTyped.delete(id);
    }
  }
  return nextTyped;
}

// The worksheet between the card's header and its footer: the month,
// the note that the draft was restored, where it was, with the press
// that starts again, a field a balance in its group, and the balances
// the month leaves, given every row and the rows checked among them.
function Worksheet({
  announcement,
  checked,
  draft,
  from,
  isRestored,
  month,
  onAmend,
  onAnnounce,
  onDrop,
  plan,
  portfolio,
  rows,
  today,
}: {
  readonly announcement: string;
  readonly checked: readonly Row[];
  readonly draft: Draft;
  readonly from: Month;
  readonly isRestored: boolean;
  readonly month: Month;
  readonly onAmend: (draft: Draft) => void;
  readonly onAnnounce: (message: string) => void;
  readonly onDrop: () => void;
  readonly plan: Plan;
  readonly portfolio: MonthEndPortfolio | undefined;
  readonly rows: readonly Row[];
  readonly today: string;
}): JSX.Element {
  const checkButtonRef = useRef(new Map<number, HTMLButtonElement>());
  const was = rows.reduce((sum, { account }) => sum + account.balance, 0);
  const paid = checked.reduce((sum, row) => sum + row.paid, 0);
  const moved = checked.reduce(
    (sum, row) => sum + row.now - row.account.balance - row.paid,
    0,
  );

  function bindCheckButton(
    id: number,
    element: HTMLButtonElement | null,
  ): void {
    if (element === null) {
      checkButtonRef.current.delete(id);
    } else {
      checkButtonRef.current.set(id, element);
    }
  }

  function changeAsOf(nextAsOf: Month): void {
    onAnnounce("");
    onAmend({
      ...draft,
      asOf: nextAsOf,
      typed: typedForMonth(draft, nextAsOf, { due: month, portfolio }),
    });
  }

  function check(account: Account, isChecked: boolean): void {
    const next = new Set(draft.checked);
    if (isChecked) {
      next.add(account.id);
    } else {
      next.delete(account.id);
    }
    onAnnounce("");
    onAmend({ ...draft, checked: next });
  }

  function checkRest(ids: readonly number[]): void {
    onAmend({ ...draft, checked: new Set([...draft.checked, ...ids]) });
  }

  function prefillGroup(
    targets: readonly PrefillTarget[],
    firstId: number,
  ): void {
    const nextTyped = new Map(draft.typed);
    for (const { account, balance } of targets) {
      nextTyped.set(account.id, balance);
    }
    onAmend({ ...draft, typed: nextTyped });
    onAnnounce(
      `Prefilled ${counted(targets.length, "balance")} from Portfolio. Check each balance to confirm.`,
    );
    checkButtonRef.current.get(firstId)?.focus();
  }

  function prefillRow(account: Account, balance: number): void {
    const nextChecked = new Set(draft.checked);
    nextChecked.delete(account.id);
    onAmend({
      ...draft,
      checked: nextChecked,
      typed: new Map(draft.typed).set(account.id, balance),
    });
    onAnnounce(
      `${account.name} set to ${formatGbp(balance)}. Check to confirm.`,
    );
    checkButtonRef.current.get(account.id)?.focus();
  }

  function type(account: Account, value: number): void {
    onAnnounce("");
    onAmend({
      ...draft,
      checked: new Set(draft.checked).add(account.id),
      typed: new Map(draft.typed).set(account.id, typedAs(account, value)),
    });
  }

  return (
    <>
      <FieldRow layout="pair">
        <MonthField
          label="Month"
          onValueChange={(picked) => {
            changeAsOf({ ...draft.asOf, month: picked });
          }}
          value={draft.asOf.month}
        />
        <YearField
          label="Year"
          max={month.year}
          min={plan.born}
          onValueCommitted={(year) => {
            changeAsOf({ ...draft.asOf, year });
          }}
          value={draft.asOf.year}
        />
      </FieldRow>
      {isRestored && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Note>
            The balances are as they were left in this tab, kept until saved or
            the tab is closed.
          </Note>
          <Button onClick={onDrop} size="xs" variant="outline">
            Start again
          </Button>
        </div>
      )}
      <Note>
        {portfolio === undefined
          ? "Each balance opens at what the plan expected. Check it or type the statement's figure; only checked balances are saved."
          : "Each balance opens at what the plan expected. Check it, prefill from Portfolio or type the statement's figure; only checked balances are saved."}
      </Note>
      {portfolio !== undefined && (
        <p className="sr-only" role="status">
          {announcement}
        </p>
      )}
      {balanceGroups.map(({ holds, isStated, name }) => {
        const held = rows.filter(({ account }) => holds(account));
        return (
          held.length > 0 && (
            <BalanceGroup
              draft={draft}
              held={held}
              isStated={isStated}
              key={name}
              month={month}
              name={name}
              onBindCheckButton={bindCheckButton}
              onCheck={check}
              onCheckRest={checkRest}
              onPrefillGroup={prefillGroup}
              onPrefillRow={prefillRow}
              onType={type}
              portfolio={portfolio}
              today={today}
            />
          )
        );
      })}
      <Ledger
        steps={[
          {
            detail: formatDay(cutOf(monthBefore(from))),
            figure: formatGbp(was),
            label: "As the balances stood",
          },
          { figure: formatGbp(paid), label: "Paid in" },
          {
            detail: "Markets, interest and the unexpected",
            figure: pounds(moved),
            label: "Moved",
          },
        ]}
        total={formatGbp(was + paid + moved)}
        totalName={`As the balances stand on ${formatDay(cutOf(draft.asOf))}`}
      />
    </>
  );
}
