import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { IncomeLineValues } from "@/data/income";
import type { Option } from "@/lib/options";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField } from "@/components/app/molecules/money-field";
import { RateField } from "@/components/app/molecules/rate-field";
import { SelectField } from "@/components/app/molecules/select-field";

interface EmploymentFieldsProps {
  readonly draft: IncomeLineValues;
  readonly initial: IncomeLineValues;
  readonly onAmend: (patch: Partial<IncomeLineValues>) => void;
  readonly pensions: readonly Account[];
}

// The fields only an employment line takes, sitting in the slot the line
// fields leave for whatever a schedule adds: its bonus and RSUs on a row
// of their own, and beneath them the pension it feeds, chosen from the
// pensions among the accounts the page hands down, with the share of the
// base it sacrifices beside it while a pension is chosen. The fields are
// uncontrolled and mount with the line as it opened, and report each
// change to the schedule, whose draft mirrors them, as the line fields
// beside them do.
export function EmploymentFields({
  draft,
  initial,
  onAmend,
  pensions,
}: EmploymentFieldsProps): JSX.Element {
  // The pension choice's options: none, and each pension by its id,
  // as the select's string, since two may share a name.
  const pensionChoices: readonly Option<string>[] = [
    { label: "None", value: "none" },
    ...pensions.map((pension) => ({
      label: pension.name,
      value: String(pension.id),
    })),
  ];

  // The pension choice: a line feeding none gives up nothing, and the
  // share goes with the field that shows it; a line given a pension
  // keeps the share it has, or takes the one it opened with when the
  // field comes back, which is what it mounts showing.
  function feed(choice: string): void {
    onAmend(
      choice === "none"
        ? { feeds: null, sacrifice: 0 }
        : {
            feeds: Number(choice),
            sacrifice:
              draft.feeds === null ? initial.sacrifice : draft.sacrifice,
          },
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
          defaultValue={initial.feeds === null ? "none" : String(initial.feeds)}
          hint="Fed by salary sacrifice, with the employer's NI saved"
          label="Pension"
          onValueChange={feed}
          options={pensionChoices}
        />
        {draft.feeds !== null && (
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
    </>
  );
}
