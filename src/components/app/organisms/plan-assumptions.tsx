"use client";

import type { JSX } from "react";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import type { Drawdown, Plan, PlanAges } from "@/data/plan";

import { saveAges, saveDrawdown } from "@/actions/plan";
import { AgeField } from "@/components/app/molecules/age-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { Button } from "@/components/kit/button";
import { retiresOn } from "@/data/milestones";
import { ageIn, drawdowns, endAge, oldestAge } from "@/data/plan";
import { useSender } from "@/hooks/use-sender";
import { optionsOf } from "@/lib/options";

// What the dialog holds while it is open: the age the plan runs to and
// the order it draws a shortfall in.
interface Draft {
  readonly drawdown: Drawdown;
  readonly ends: number;
}

interface PlanAssumptionsProps {
  readonly plan: Plan;
}

// The drawdowns as Drawn down offers them, each under its name and in
// the order the plan lists them, so a drawdown the engine holds cannot
// go unoffered or unnamed.
const orders = optionsOf<Drawdown>(
  {
    "pension-before-isa": "Pension before the ISA",
    "pension-first": "Pension first",
    "pension-to-allowance": "Pension to the personal allowance",
    "pension-to-basic-rate": "Pension to the basic rate band",
    "savings-first": "Savings first",
  },
  drawdowns,
);

// The dashboard's assumptions: a button in its header opening a dialog
// on the age the plan runs to and the order it draws a shortfall in,
// the age typed into a box with no slider, since
// the plan's whole span is set on purpose rather than watched as it
// moves, with the year that age falls in beneath it and the title
// saying what the plan will be projected to. The age runs from the year
// after the one its owner has reached, or from the age they retire at
// if that is later, since a save is held to a plan with a year to
// project and a retirement within it, where they retire at an age
// rather than on conditions, to the oldest age a plan may run
// to, a typed age outside them held to the nearer. The order is one of
// the engine's drawdowns, savings first for a plan naming none, with
// what holds a pension back from the order beneath it. The dialog holds
// a draft, the age and the order as it opened or as set since, or
// nothing while it is closed, so
// the draft doubles as the dialog's open state, and nothing reaches the
// store until Save. Save sends the order if it moved, and then the age
// unless the order alone moved, so a save moving both writes twice; it
// holds while they are on their way. The store's
// answer closes the dialog onto the dashboard re-read, the chart run
// to the new age and drawn the new way, and a toast saying the age it
// is projected to; a store that refuses leaves the dialog
// open as it was and says why under a toast.
export function PlanAssumptions({ plan }: PlanAssumptionsProps): JSX.Element {
  const [draft, setDraft] = useState<Draft | null>(null);
  const { isSending: isSaving, send } = useSender();
  const drawdown = plan.drawdown ?? "savings-first";

  function save(saving: Draft): void {
    send<Drawdown | PlanAges>(
      async () => {
        if (saving.drawdown !== drawdown) {
          const answer = await saveDrawdown(saving.drawdown);
          if (answer.kind === "refused" || saving.ends === endAge(plan)) {
            return answer;
          }
        }
        return saveAges({ ends: saving.ends });
      },
      {
        failure: "Assumptions not saved",
        onAccepted: () => {
          setDraft(null);
        },
        success: () => ({
          description: `Projected to age ${String(saving.ends)}`,
          title: "Assumptions updated",
        }),
      },
    );
  }

  return (
    <>
      <Button
        onClick={() => {
          setDraft({ drawdown, ends: endAge(plan) });
        }}
        size="sm"
      >
        <SlidersHorizontal aria-hidden />
        Assumptions
      </Button>
      {draft !== null && (
        <EditDialog
          canSave={!isSaving}
          eyebrow="Assumptions"
          onDismiss={() => {
            setDraft(null);
          }}
          onSave={() => {
            save(draft);
          }}
          title={`Projected to age ${String(draft.ends)}`}
        >
          <AgeField
            hasSlider={false}
            hint={`Runs to ${String(plan.born + draft.ends)}`}
            label="Plan end age"
            max={oldestAge}
            min={Math.max(
              retiresOn(plan) === undefined ? plan.retires : 0,
              ageIn(plan.from, plan) + 1,
            )}
            onValueCommitted={(ends) => {
              setDraft({ ...draft, ends });
            }}
            value={draft.ends}
          />
          <SelectField
            defaultValue={drawdown}
            hint="A pension is drawn last before its owner's pension age, and fills no band while its owner works"
            label="Drawn down"
            onValueChange={(chosen) => {
              setDraft({ ...draft, drawdown: chosen });
            }}
            options={orders}
          />
        </EditDialog>
      )}
    </>
  );
}
