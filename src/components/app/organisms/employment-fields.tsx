import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { BonusCadence, IncomeLineDraft } from "@/data/income";
import type { Owner } from "@/data/owners";
import type { Option } from "@/lib/options";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField, RateField } from "@/components/app/molecules/figure-field";
import { MonthField } from "@/components/app/molecules/month-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { isFeeding, totalOf } from "@/data/income";
import { yearly } from "@/lib/cadence";
import { formatGbp } from "@/lib/money";
import { optionsOf } from "@/lib/options";
import { ownerFor, ownerOptions } from "@/lib/owners";

// How a bonus is paid, as the choice offers it: every month, which a
// line holds as no cadence at all, or at a cadence it names.
type BonusChoice = "month" | BonusCadence;

interface EmploymentFieldsProps {
  readonly draft: IncomeLineDraft;
  readonly initial: IncomeLineDraft;
  readonly onAmend: (patch: Partial<IncomeLineDraft>) => void;
  readonly onTime: (timing: Timing) => void;
  readonly owners: readonly Owner[];
  readonly pensions: readonly Account[];
}

// How a bonus is paid, as a line holds it: both fields absent for one
// paid every month, the cadence alone for one paid every quarter, and
// the cadence and the month for one paid once a year. The schedule puts
// it in place of how the draft's was paid, since a patch can set a
// field the line holds only sometimes but cannot take one away.
type Timing = Pick<IncomeLineDraft, "bonusCadence" | "bonusMonth">;

// How a bonus may be paid, in the order the choice offers them, the
// most often first.
const bonusChoices = optionsOf<BonusChoice>(
  { month: "Every month", quarter: "Every quarter", year: "Once a year" },
  ["month", "quarter", "year"],
);

// The pension choice's two choices that are no pension listed: none,
// and one the save opens.
const none = "none";
const opened = "new";

// The fields only an employment line takes, sitting in the slot the line
// fields leave for whatever a schedule adds: its bonus and RSUs on a row
// of their own, with what the base and both come to a year beside them,
// read off the draft as it is typed and said aloud as it changes, since
// the parts are typed at the salary's cadence and a bonus typed as a
// year's and left on a monthly salary is paid twelve times over; how
// the bonus is paid beneath them, every month, every quarter, in the
// last month of each, or once a year in a month chosen beside it, which
// shows only for a bonus paid so, the figure typed being the same
// whichever is chosen; and
// beneath them the pension it feeds, chosen from the
// pensions among the accounts the page hands down, or none, or a new
// one the save opens, with the share of the base it sacrifices and the
// share its employer matches beside it while there is a pension to
// take them. A new pension asks its name,
// what it holds today and its owner on a row of its own beneath, since
// the accounts list it by name and every pension belongs to an owner,
// the first the page hands down until another is chosen; the rest of
// what an account carries is
// left at what a new pension is and edited from the accounts. The
// fields are uncontrolled and mount with the line as it opened, and
// report each change to the schedule, whose draft mirrors them, as the
// line fields beside them do.
export function EmploymentFields({
  draft,
  initial,
  onAmend,
  onTime,
  owners,
  pensions,
}: EmploymentFieldsProps): JSX.Element {
  const { opens } = draft;

  // The pension choice's options: none, each pension by its id, as the
  // select's string, since two may share a name, and a new one.
  const pensionChoices: readonly Option<string>[] = [
    { label: "None", value: none },
    ...pensions.map((pension) => ({
      label: pension.name,
      value: String(pension.id),
    })),
    { label: "A new pension", value: opened },
  ];

  // The pension choice: a line feeding none gives up nothing and is
  // matched nothing, and the shares go with the fields that show them;
  // a line given a pension, listed or new, keeps the shares it has, or
  // takes the ones it opened with when the fields come back, which is
  // what they mount showing. A new pension opens unnamed, holding
  // nothing and belonging to the first owner, which its fields mount
  // showing, and a listed one opens none.
  function feed(choice: string): void {
    if (choice === none) {
      onAmend({ feeds: null, match: 0, opens: null, sacrifice: 0 });
      return;
    }
    const { match, sacrifice } = isFeeding(draft) ? draft : initial;
    onAmend(
      choice === opened
        ? {
            feeds: null,
            match,
            opens: { balance: 0, name: "", owner: ownerFor(null, owners) },
            sacrifice,
          }
        : { feeds: Number(choice), match, opens: null, sacrifice },
    );
  }

  return (
    <>
      <FieldRow layout="triple">
        <MoneyField
          defaultValue={initial.bonus}
          hint="At the salary's cadence"
          label="Bonus"
          onValueCommitted={(bonus) => {
            onAmend({ bonus });
          }}
        />
        <MoneyField
          defaultValue={initial.rsu}
          hint="Vesting at the salary's cadence"
          label="RSUs"
          onValueCommitted={(rsu) => {
            onAmend({ rsu });
          }}
        />
        <div className="grid content-start gap-2">
          <span className="label text-muted-foreground">In all</span>
          <span aria-live="polite" className="figure font-medium">
            {`${formatGbp(yearly(totalOf(draft), draft.cadence))} a year`}
          </span>
        </div>
      </FieldRow>
      <FieldRow layout="triple">
        <SelectField
          defaultValue={initial.bonusCadence ?? "month"}
          hint={
            draft.bonusCadence === "quarter"
              ? "In March, June, September and December"
              : undefined
          }
          label="Bonus paid"
          onValueChange={(choice) => {
            onTime(timingOf(choice, initial));
          }}
          options={bonusChoices}
        />
        {draft.bonusMonth !== undefined && (
          <MonthField
            label="Bonus month"
            onValueChange={(bonusMonth) => {
              onAmend({ bonusMonth });
            }}
            value={draft.bonusMonth}
          />
        )}
      </FieldRow>
      <FieldRow layout="triple">
        <SelectField
          defaultValue={choiceOf(initial)}
          label="Pension"
          onValueChange={feed}
          options={pensionChoices}
        />
        {isFeeding(draft) && (
          <>
            <RateField
              defaultValue={initial.sacrifice}
              hint="Of the base alone"
              label="Salary sacrifice"
              max={1}
              min={0}
              onValueCommitted={(sacrifice) => {
                onAmend({ sacrifice });
              }}
            />
            <RateField
              defaultValue={initial.match}
              hint="Pound for pound, up to this share of the base"
              label="Employer match"
              max={1}
              min={0}
              onValueCommitted={(match) => {
                onAmend({ match });
              }}
            />
          </>
        )}
      </FieldRow>
      {opens !== null && (
        <FieldRow layout="triple">
          <TextField
            defaultValue=""
            label="Pension name"
            onValueChange={(name) => {
              onAmend({ opens: { ...opens, name } });
            }}
            placeholder="Aviva, Nest, People's Pension…"
          />
          <MoneyField
            defaultValue={0}
            label="Pension balance"
            onValueCommitted={(balance) => {
              onAmend({ opens: { ...opens, balance } });
            }}
          />
          <SelectField
            defaultValue={String(ownerFor(null, owners) ?? "")}
            hint={
              owners.length === 0
                ? "Add one on the accounts screen first"
                : undefined
            }
            isDisabled={owners.length === 0}
            label="Pension owner"
            onValueChange={(owner) => {
              onAmend({ opens: { ...opens, owner: Number(owner) } });
            }}
            options={ownerOptions(owners)}
          />
        </FieldRow>
      )}
    </>
  );
}

// The pension choice a line opened on: none, the id of the pension it
// feeds, or the new one it opens, which a line never opens with, since
// a saved line feeds its pension by id.
function choiceOf(line: IncomeLineDraft): string {
  if (line.opens !== null) {
    return opened;
  }
  return line.feeds === null ? none : String(line.feeds);
}

// How a bonus paid as chosen is held: every month as no cadence or
// month at all, as a line kept before it was asked is; every quarter as
// the cadence alone; and once a year in the month the line opened with,
// or in January for one that opened with none, which the month's field
// mounts showing, as the pension's shares come back as the line opened.
function timingOf(choice: BonusChoice, initial: IncomeLineDraft): Timing {
  switch (choice) {
    case "month":
      return {};
    case "quarter":
      return { bonusCadence: choice };
    case "year":
      return { bonusCadence: choice, bonusMonth: initial.bonusMonth ?? 0 };
  }
}
