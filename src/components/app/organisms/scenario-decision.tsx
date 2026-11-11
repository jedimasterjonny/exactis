"use client";

import type { JSX } from "react";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Decision } from "@/store/household";

import {
  adoptScenario,
  enterScenario,
  rejectScenario,
} from "@/actions/scenarios";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { Button } from "@/components/kit/button";
import { DialogDescription } from "@/components/kit/dialog";
import { useSender } from "@/hooks/use-sender";
import { dashboard } from "@/lib/nav";

// What the decision asks before it is sent: which it is, and the reason
// as typed.
interface Asking {
  readonly kind: "adopt" | "reject";
  readonly reason: string;
}

interface ScenarioDecisionProps {
  readonly decision: Decision["kind"] | null;
  readonly isAdoptable: boolean;
  readonly isRetargeted?: boolean;
  readonly name: string;
  readonly shown: Parameters<typeof adoptScenario>[1];
}

// The longest reason a decision keeps.
const longest = 200;

// The end of setting a scenario beside the household, in the header's
// actions: making it the household or deciding against it, each asked
// in a dialog whose title is the question, with a line on why, which
// may be left blank, and sent against the versions the page was drawn
// from, the Make dialog saying too, where adopting moves a share of the
// target allocation, that the next import replaces it; or opening it,
// for a scenario decided already, to edit a new one made from it or to
// delete it, which takes it to the dashboard.
// An undecided scenario offers both decisions, one decided against
// offers making it the household and opening it, and one made the
// household opening it alone, so nobody decides the same way twice.
// Making it the household is left out while the merge is refused, since
// it would only refuse in the same words, which the screen already
// says; deciding against it is not, which the merge has no part in.
// Neither leans either way, so both are outlined. Each holds while
// anything is on its way to the store, as the dialog's confirm does,
// and the confirm holds too while the reason runs past its length. Each
// answer is said under a toast, a refusal in its own words. Once a
// decision lands the button that asked for it is gone, so the focus is
// handed to the screen's title, which says what was decided.
export function ScenarioDecision({
  decision,
  isAdoptable,
  isRetargeted = false,
  name,
  shown,
}: ScenarioDecisionProps): JSX.Element {
  const [asking, setAsking] = useState<Asking | null>(null);
  const { isSending, send } = useSender();
  const router = useRouter();
  const close = (): void => {
    setAsking(null);
  };

  function decided(): void {
    setAsking(null);
    document.querySelector<HTMLElement>("h1")?.focus();
  }

  function decide({ kind, reason }: Asking): void {
    if (kind === "adopt") {
      send(async () => adoptScenario(name, shown, reason), {
        failure: "Household not replaced",
        onAccepted: decided,
        success: (isDecided) => ({
          description: isDecided
            ? "Edits are saved to the household"
            : "Edits are saved to the household; the scenario's decision could not be kept, so it is left undecided",
          title: `${name} is the household`,
        }),
      });
    } else {
      send(async () => rejectScenario(name, shown, reason), {
        failure: "Decision not kept",
        onAccepted: decided,
        success: () => ({
          description: "Kept in the scenario menu, under Decided against",
          title: `Decided against ${name}`,
        }),
      });
    }
  }

  function open(): void {
    send(async () => enterScenario(name), {
      failure: "Scenario not opened",
      onAccepted: () => {
        router.push(dashboard.href);
      },
      success: (opened) => ({
        description:
          "It is decided, so it takes no edits; make a new scenario from it to change it",
        title: `${opened} opened`,
      }),
    });
  }

  return (
    <>
      {decision !== "adopted" && isAdoptable && (
        <Button
          disabled={isSending}
          onClick={() => {
            setAsking({ kind: "adopt", reason: "" });
          }}
          size="sm"
          variant="outline"
        >
          Make this the household…
        </Button>
      )}
      {decision === null ? (
        <Button
          disabled={isSending}
          onClick={() => {
            setAsking({ kind: "reject", reason: "" });
          }}
          size="sm"
          variant="outline"
        >
          Decide against…
        </Button>
      ) : (
        <Button disabled={isSending} onClick={open} size="sm" variant="outline">
          Open the scenario
        </Button>
      )}
      {asking !== null && (
        <EditDialog
          canSave={!isSending && asking.reason.trim().length <= longest}
          confirm={
            asking.kind === "adopt" ? "Make the household" : "Decide against"
          }
          eyebrow="Scenario"
          isSaving={isSending}
          onDismiss={close}
          onSave={() => {
            decide(asking);
          }}
          title={
            asking.kind === "adopt"
              ? `Make ${name} the household?`
              : `Decide against ${name}?`
          }
        >
          <DialogDescription className="grid gap-4" render={<div />}>
            <p>
              {asking.kind === "adopt"
                ? "The scenario's plan, its target allocation included, replaces the household's. The household keeps its own balances, progress points and house prices, whatever the scenario holds. The BlackRock CMA, the BoE curve and the holdings imported are each the newer of the two. The scenario is kept under Made the household."
                : "The household is not touched. The scenario is kept under Decided against in the scenario menu, and can be opened again from there."}
            </p>
            {asking.kind === "adopt" && isRetargeted && (
              <p>
                Each import takes the targets the Portfolio Performance file
                holds, so the next one replaces the scenario&apos;s unless the
                file holds them too.
              </p>
            )}
          </DialogDescription>
          <TextField
            hint={`Optional, up to ${String(longest)} characters. Kept with the decision, to read back later.`}
            label="Why"
            onValueChange={(reason) => {
              setAsking({ ...asking, reason });
            }}
          />
        </EditDialog>
      )}
    </>
  );
}
