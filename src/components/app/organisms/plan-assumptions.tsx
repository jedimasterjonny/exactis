"use client";

import type { JSX } from "react";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import type { Plan } from "@/data/plan";

import { saveAges } from "@/actions/plan";
import { AgeField } from "@/components/app/molecules/age-field";
import { EditDialog } from "@/components/app/molecules/edit-dialog";
import { Button } from "@/components/kit/button";
import { endAge, oldestAge } from "@/data/plan";
import { useSender } from "@/hooks/use-sender";

interface PlanAssumptionsProps {
  readonly plan: Plan;
}

// The dashboard's assumptions: a button in its header opening a dialog
// on the age the plan runs to, typed into a box with no slider, since
// the plan's whole span is set on purpose rather than watched as it
// moves, with the year that age falls in beneath it and the title
// saying what the plan will be projected to. The age runs from the year
// after the one its owner has reached, or from the age they retire at
// if that is later, since a save is held to a plan with a year to
// project and a retirement within it, to the oldest age a plan may run
// to, a typed age outside them held to the nearer. The dialog holds a draft, the
// age as it opened or as typed since, or nothing while it is closed, so
// the draft doubles as the dialog's open state, and nothing reaches the
// store until Save. Save holds while the age is on its way; the store's
// answer closes the dialog onto the dashboard re-read, the chart run
// to the new age, and a toast; a store that refuses leaves the dialog
// open as it was and says why under a toast.
export function PlanAssumptions({ plan }: PlanAssumptionsProps): JSX.Element {
  const [ends, setEnds] = useState<null | number>(null);
  const { isSending: isSaving, send } = useSender();

  function save(age: number): void {
    send(async () => saveAges({ ends: age }), {
      failure: "Assumptions not saved",
      onAccepted: () => {
        setEnds(null);
      },
      success: (saved) => ({
        description: `Projected to age ${String(saved.ends)}`,
        title: "Assumptions updated",
      }),
    });
  }

  return (
    <>
      <Button
        onClick={() => {
          setEnds(endAge(plan));
        }}
        size="sm"
      >
        <SlidersHorizontal aria-hidden />
        Assumptions
      </Button>
      {ends !== null && (
        <EditDialog
          canSave={!isSaving}
          eyebrow="Assumptions"
          onDismiss={() => {
            setEnds(null);
          }}
          onSave={() => {
            save(ends);
          }}
          title={`Projected to age ${String(ends)}`}
        >
          <AgeField
            hasSlider={false}
            hint={`Runs to ${String(plan.born + ends)}`}
            label="Plan end age"
            max={oldestAge}
            min={Math.max(plan.retires, plan.from - plan.born + 1)}
            onValueCommitted={setEnds}
            value={ends}
          />
        </EditDialog>
      )}
    </>
  );
}
