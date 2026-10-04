"use client";

import type { JSX } from "react";

import { ArrowDown, ArrowUp, ArrowUpDown, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Account } from "@/data/accounts";
import type { Owner } from "@/data/owners";
import type { Plan } from "@/data/plan";
import type { CashFlow, Paid, Schedule } from "@/engine/cash-flow";

import { RowAction } from "@/components/app/atoms/row-action";
import { ShareBar } from "@/components/app/atoms/share-bar";
import { SectionCard } from "@/components/app/molecules/section-card";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { allowanceOf, isOwned } from "@/data/accounts";
import { cashFlow } from "@/engine/cash-flow";
import { listed } from "@/lib/feeders";
import { formatGbp } from "@/lib/money";
import { formatMonth } from "@/lib/months";

type Direction = "down" | "up";

// What lands in an account in the month, by where it comes from.
interface Landed {
  readonly fed: number;
  readonly feeders: readonly string[];
  readonly fixed: number;
  readonly relief: number;
  readonly spare: number;
}

interface MoneyFlowProps {
  readonly accounts: readonly Account[];
  readonly label: string;
  readonly onMove: (account: Account, target: Account) => void;
  readonly owners: readonly Owner[];
  readonly plan: Plan;
  readonly savings: readonly Account[];
  readonly schedule: Schedule;
}

// A move made from a step's arrows: the account moved, which way, and
// the place it lands in, so the arrow can be focused again once the
// step is drawn there.
interface Moved {
  readonly direction: Direction;
  readonly id: number;
  readonly place: number;
}

// Where a step's arrow moves it: which way, the place it lands in, and
// the account it moves onto there.
interface Moving {
  readonly direction: Direction;
  readonly place: number;
  readonly target: Account;
}

// A fraction of a pound, below which a room is taken as full and a
// month's take as none, as the flow's own sums are rounded.
const penny = 0.01;

// The order of payment drawn as the money it moves: the month the plan
// starts in, worked out by the engine, which is pure and cheap, as the
// plan screen's cash flow card runs it. The card says what is spare once
// tax, the expenses, the loans' payments and the fixed sums are met,
// then lists the savings in the order they are paid, each with what
// lands in it that month and where that comes from: a salary's sacrifice
// with the NI saved, its own fixed sum, its take of the spare money, and
// the basic rate a pension claims back. A saving paid the spare money
// says the most it takes where its allowance does not say it already,
// and when it takes none says why: the spare money ran out before it,
// its own cap was met, or its owner's allowance was. An ISA or a pension draws its owner's allowance for its kind as a
// bar, filled with what lands in every account of that kind the owner
// holds, a year at the month's rate, since the engine holds them to a
// twelfth of it together; so a pension shares its owner's allowance with
// the others it names. What is left once every saving has taken what it
// can closes the list, as what the plan takes as spent, or as what the
// month is short by and draws from the savings. Debts are paid before
// any of it and have no place in the order, which the caption says.
// Reorder shows an arrow up and down on each step, and each move goes to
// the caller as the account and the one it moves onto, as dragging did,
// and is said aloud with the place it lands in. The arrow pressed keeps
// the focus once the step is drawn in its new place, or the other arrow
// does when the step has reached an end. A list of no savings draws
// nothing, having no order to show.
export function MoneyFlow({
  accounts,
  label,
  onMove,
  owners,
  plan,
  savings,
  schedule,
}: MoneyFlowProps): JSX.Element | null {
  const [isReordering, setIsReordering] = useState(false);
  const [said, setSaid] = useState("");
  const movedRef = useRef<Moved | null>(null);
  const arrowsRef = useRef(new Map<string, HTMLButtonElement | null>());

  useEffect(() => {
    const pending = movedRef.current;
    if (pending === null || savings[pending.place]?.id !== pending.id) {
      return;
    }
    movedRef.current = null;
    const isAtEnd =
      pending.place === (pending.direction === "up" ? 0 : savings.length - 1);
    const direction = isAtEnd ? opposite(pending.direction) : pending.direction;
    arrowsRef.current.get(`${String(pending.id)} ${direction}`)?.focus();
  });

  if (savings.length === 0) {
    return null;
  }

  const at = { month: plan.month, year: plan.from };
  const flow = cashFlow(accounts, schedule, { at, plan });
  const spare =
    flow.left + flow.spare.reduce((sum, take) => sum + take.amount, 0);
  const month = formatMonth({ month: plan.month, year: plan.from });
  // The arrows show while reordering and while there is an order to set,
  // so a list cut to one saving, by a delete made meanwhile, drops them
  // with the button that would have put them away.
  const isMoving = isReordering && savings.length > 1;

  function move(account: Account, to: Moving): void {
    movedRef.current = {
      direction: to.direction,
      id: account.id,
      place: to.place,
    };
    setSaid(
      `${account.name} moved to ${String(to.place + 1)} of ${String(savings.length)}`,
    );
    onMove(account, to.target);
  }

  return (
    <SectionCard
      actions={
        savings.length > 1 && (
          <Button
            aria-pressed={isReordering}
            onClick={() => {
              setIsReordering(!isReordering);
            }}
            size="sm"
            variant="outline"
          >
            {isReordering ? <Check aria-hidden /> : <ArrowUpDown aria-hidden />}
            {isReordering ? "Done" : "Reorder"}
          </Button>
        )
      }
      caption="Debts are always paid first. Savings are then paid in this order, and drawn on in it one kind at a time."
      label={label}
      title="Where the month's money goes"
    >
      <CardContent className="grid gap-4">
        <p className="text-sm">
          {spare > penny
            ? `${formatGbp(spare)} a month is spare in ${month}, once tax, the expenses, the loans' payments and any fixed sums are met, and the savings take it in this order.`
            : `Nothing is spare in ${month} once tax, the expenses, the loans' payments and any fixed sums are met.`}
        </p>
        <ol className="divide-y border-y">
          {savings.map((account, index) => {
            const landed = landedIn(account, flow);
            return (
              <li className="flex gap-3 py-3" key={account.id}>
                <span
                  aria-hidden
                  className="w-4 shrink-0 pt-0.5 figure text-xs text-muted-foreground"
                >
                  {index + 1}
                </span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{account.name}</span>
                    <span className="figure">{`${formatGbp(totalOf(landed))} / mo`}</span>
                  </p>
                  <Lines
                    account={account}
                    flow={flow}
                    landed={landed}
                    owners={owners}
                    savings={savings}
                  />
                </div>
                {isMoving && (
                  <span className="flex shrink-0 gap-1 self-center">
                    {(["up", "down"] as const).map((direction) => {
                      const place = index + (direction === "up" ? -1 : 1);
                      const target = savings[place];
                      return (
                        <RowAction
                          disabled={target === undefined}
                          icon={direction === "up" ? ArrowUp : ArrowDown}
                          key={direction}
                          name={`Move ${account.name} ${direction}`}
                          {...(target !== undefined && {
                            onClick: (): void => {
                              move(account, { direction, place, target });
                            },
                          })}
                          ref={(node) => {
                            arrowsRef.current.set(
                              `${String(account.id)} ${direction}`,
                              node,
                            );
                          }}
                        />
                      );
                    })}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="flex items-baseline justify-between gap-3">
          <span className="label text-muted-foreground">
            {flow.left < -penny ? "Short" : "Left over"}
          </span>
          <span className="figure">{`${formatGbp(Math.abs(flow.left) < penny ? 0 : Math.abs(flow.left))} / mo`}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {flow.left < -penny
            ? "What the month is short by is drawn from the savings, cash first."
            : "What no saving takes is left in the month, which the plan takes as spent."}
        </p>
        <p aria-live="polite" className="sr-only">
          {said}
        </p>
      </CardContent>
    </SectionCard>
  );
}

// What lands in an account in the month, from each source the flow
// lists it under: what the salaries feeding it land with the NI saved,
// and who they are, its own fixed sum, its take of the spare money, and
// the relief a pension claims back on what it is paid.
function landedIn(account: Account, flow: CashFlow): Landed {
  const fed = flow.fed.filter((entry) => entry.account.id === account.id);
  return {
    fed: sumIn(fed),
    feeders: fed.map(({ line }) => line.name),
    fixed: sumIn(flow.fixed.filter((entry) => entry.account.id === account.id)),
    relief: sumIn(
      flow.relief.filter((entry) => entry.account.id === account.id),
    ),
    spare: sumIn(flow.spare.filter((entry) => entry.account.id === account.id)),
  };
}

// The lines beneath a step's name: whose it is and where what lands in
// it comes from; for one paid the spare money, the most it takes and why
// it takes none when it does; and for an ISA or a pension, its owner's
// allowance for its kind, as a bar and in words.
function Lines({
  account,
  flow,
  landed,
  owners,
  savings,
}: {
  readonly account: Account;
  readonly flow: CashFlow;
  readonly landed: Landed;
  readonly owners: readonly Owner[];
  readonly savings: readonly Account[];
}): JSX.Element {
  const take = flow.spare.find((entry) => entry.account.id === account.id);
  const allowance = allowanceOf(account.kind);
  const sharing = savings.filter(
    (other) => other.kind === account.kind && other.owner === account.owner,
  );
  const used =
    12 *
    sharing.reduce((sum, other) => sum + totalOf(landedIn(other, flow)), 0);
  const isFull = allowance !== null && used >= allowance - 12 * penny;
  const about = [
    owners.find(({ id }) => id === account.owner)?.name,
    sourcesOf(landed),
    take === undefined
      ? undefined
      : spareOf(landed, { allowance, cap: take.cap, isFull }),
    account.isAlwaysFunded === true ? "always funded" : undefined,
  ].filter((part) => part !== undefined);
  return (
    <div className="grid gap-0.5 text-xs text-muted-foreground">
      {about.length > 0 && <span>{about.join(" · ")}</span>}
      {isOwned(account) && allowance !== null && (
        <>
          <ShareBar className="my-1 h-1.5 w-full" share={used / allowance} />
          <span>
            {[
              `${formatGbp(used)} of the ${formatGbp(allowance)} allowance a year`,
              sharing.length > 1
                ? `shared with ${listed.format(sharing.filter((other) => other !== account).map(({ name }) => name))}`
                : undefined,
            ]
              .filter((part) => part !== undefined)
              .join(", ")}
          </span>
        </>
      )}
    </div>
  );
}

// The other way.
function opposite(direction: Direction): Direction {
  return direction === "up" ? "down" : "up";
}

// Where what lands in an account comes from, each with its amount when
// there are two or more, since the step's figure is the amount of one.
function sourcesOf(landed: Landed): string | undefined {
  const sources = [
    {
      amount: landed.fed,
      what: `salary sacrifice from ${listed.format(landed.feeders)}`,
    },
    { amount: landed.fixed, what: "fixed sum" },
    { amount: landed.spare, what: "spare money" },
    { amount: landed.relief, what: "tax relief" },
  ].filter(({ amount }) => amount >= penny);
  if (sources.length === 0) {
    return undefined;
  }
  return sources.length === 1
    ? sources[0]?.what
    : sources
        .map(({ amount, what }) => `${formatGbp(amount)} ${what}`)
        .join(" + ");
}

// What a saving paid the spare money says of it: why it takes none of
// it when it takes none, its owner's allowance having been used before
// it, its own cap met by what the salaries feed it, or the spare money
// run out before it; and otherwise the most it takes, where that is not
// the allowance its bar already says, or that it has no cap at all.
function spareOf(
  landed: Landed,
  {
    allowance,
    cap,
    isFull,
  }: {
    readonly allowance: null | number;
    readonly cap: null | number;
    readonly isFull: boolean;
  },
): string | undefined {
  if (landed.spare < penny) {
    if (isFull) {
      return "the allowance is used before the spare money reaches it";
    }
    if (cap !== null && landed.fed >= cap / 12 - penny) {
      return "the salaries meet its cap";
    }
    return "the spare money runs out before it";
  }
  if (cap === null) {
    return "no cap";
  }
  return cap === allowance ? undefined : `up to ${formatGbp(cap)} a year`;
}

// What a list of payments comes to.
function sumIn(paid: readonly Pick<Paid, "amount">[]): number {
  return paid.reduce((sum, entry) => sum + entry.amount, 0);
}

// What lands in an account in the month, from every source.
function totalOf(landed: Landed): number {
  return landed.fed + landed.fixed + landed.spare + landed.relief;
}
