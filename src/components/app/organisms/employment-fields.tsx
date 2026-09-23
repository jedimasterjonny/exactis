import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { IncomeLineDraft } from "@/data/income";
import type { Owner } from "@/data/owners";
import type { Option } from "@/lib/options";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField } from "@/components/app/molecules/money-field";
import { RateField } from "@/components/app/molecules/rate-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { isFeeding } from "@/data/income";
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
// of their own, and beneath them the pension it feeds, chosen from the
// pensions among the accounts the page hands down, or none, or a new
// one the save opens, with the share of the base it sacrifices beside
// it while there is a pension to take it. A new pension asks its name,
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

  // The pension choice: a line feeding none gives up nothing, and the
  // share goes with the field that shows it; a line given a pension,
  // listed or new, keeps the share it has, or takes the one it opened
  // with when the field comes back, which is what it mounts showing. A
  // new pension opens unnamed, holding nothing and belonging to the
  // first owner, which its fields mount showing, and a listed one opens
  // none.
  function feed(choice: string): void {
    if (choice === none) {
      onAmend({ feeds: null, opens: null, sacrifice: 0 });
      return;
    }
    const sacrifice = isFeeding(draft) ? draft.sacrifice : initial.sacrifice;
    onAmend(
      choice === opened
        ? {
            feeds: null,
            opens: { balance: 0, name: "", owner: ownerFor(null, owners) },
            sacrifice,
          }
        : { feeds: Number(choice), opens: null, sacrifice },
    );
  }

  return (
    <>
      <FieldRow layout="triple">
        <MoneyField
          defaultValue={initial.bonus}
          hint="At the salary's cadence; nothing for none"
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
      </FieldRow>
      <FieldRow layout="pair">
        <SelectField
          defaultValue={choiceOf(initial)}
          hint="Fed by salary sacrifice, with the employer's NI saved"
          label="Pension"
          onValueChange={feed}
          options={pensionChoices}
        />
        {isFeeding(draft) && (
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
        )}
      </FieldRow>
      {opens !== null && (
        <FieldRow layout="triple">
          <TextField
            defaultValue=""
            hint="Opened with the salary, growing at the plan rate"
            label="Pension name"
            onValueChange={(name) => {
              onAmend({ opens: { ...opens, name } });
            }}
            placeholder="Aviva, Nest, People's Pension…"
          />
          <MoneyField
            defaultValue={0}
            hint="What it holds today; nothing for one just opened"
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
                : "Whose allowance it is paid under"
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
