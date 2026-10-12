import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { IncomeLineDraft } from "@/data/income";
import type { Owner } from "@/data/owners";
import type { Option } from "@/lib/options";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField, RateField } from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { isFeeding, totalOf } from "@/data/income";
import { yearly } from "@/lib/cadence";
import { formatGbp } from "@/lib/money";
import { ownerFor, ownerOptions } from "@/lib/owners";

interface EmploymentFieldsProps {
  readonly draft: IncomeLineDraft;
  readonly initial: IncomeLineDraft;
  readonly onAmend: (patch: Partial<IncomeLineDraft>) => void;
  readonly owners: readonly Owner[];
  readonly pensions: readonly Account[];
}

// The pension choice's two choices that are no pension listed: none,
// and one the save opens.
const none = "none";
const opened = "new";

// The fields only an employment line takes, sitting in the slot the line
// fields leave for whatever a schedule adds: its bonus and RSUs on a row
// of their own, with what the base and both come to a year beside them,
// read off the draft as it is typed and said aloud as it changes, since
// the parts are paid at the salary's cadence and a bonus typed as a
// year's and left on a monthly salary is paid twelve times over, and
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
