"use client";

import type { JSX } from "react";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Scenarios } from "@/store/household";

import {
  createScenario,
  deleteScenario,
  enterScenario,
  leaveScenario,
} from "@/actions/scenarios";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/kit/native-select";
import { useSender } from "@/hooks/use-sender";
import { saved } from "@/lib/answer";

// What the menu has open over the dashboard: nothing, the new
// scenario's name as typed, or the question before the scenario open is
// deleted.
type Asking =
  | null
  | { readonly kind: "delete" }
  | { readonly kind: "new"; readonly name: string };

interface ScenarioMenuProps {
  readonly scenario: null | string;
  readonly scenarios: Scenarios;
}

// The longest name a scenario is kept under.
const longest = 40;

// Each branch is offered under its name, the household's empty, so no
// scenario's name can be taken for one of the menu's own commands.
const branch = "branch:";

// The dashboard's scenarios, as one select in its header: the household
// and each scenario still open, the one open chosen, then what can be
// done from there, then the scenarios decided against and those made
// the household, each group the latest decided first, so the history
// grows below the commands rather than pushing them down. Choosing an
// open branch opens it, and choosing a decided one sets it beside the
// household on Compare, which says what was decided and why, without
// opening it, since a decided scenario takes no edits; New scenario asks for
// a name and makes one from the branch open, as it stands; and while a
// scenario is open, it can be set beside the household on Compare, which
// is where it is made the household or decided against, with the
// figures in view, or deleted, asked first. The select shows the branch open, and
// goes on showing it until the dashboard is read again from the one
// chosen, so a choice the store refuses leaves it where it was; it holds
// while a choice is on its way. Each answer is said under a toast, and a
// refusal in its own words.
export function ScenarioMenu({
  scenario,
  scenarios,
}: ScenarioMenuProps): JSX.Element {
  const [asking, setAsking] = useState<Asking>(null);
  const { isSending, send } = useSender();
  const router = useRouter();
  const open = scenario ?? "";
  const decided = new Set([...scenarios.rejected, ...scenarios.adopted]);
  const close = (): void => {
    setAsking(null);
  };

  function compare(name: string): void {
    router.push(
      `/compare?${new URLSearchParams({ scenario: name }).toString()}`,
    );
  }

  function choose(value: string): void {
    if (value === "new") {
      setAsking({ kind: "new", name: "" });
    } else if (value === "compare") {
      compare(open);
    } else if (value === "delete") {
      setAsking({ kind: value });
    } else if (value === branch) {
      send(
        async () => {
          await leaveScenario();
          return saved(undefined);
        },
        {
          failure: "Household not opened",
          success: () => ({
            description: "Edits are saved to the household",
            title: "Household opened",
          }),
        },
      );
    } else if (decided.has(value.slice(branch.length))) {
      compare(value.slice(branch.length));
    } else {
      send(async () => enterScenario(value.slice(branch.length)), {
        failure: "Scenario not opened",
        success: (name) => ({
          description: "Edits are saved to the scenario",
          title: `${name} opened`,
        }),
      });
    }
  }

  return (
    <>
      <NativeSelect
        aria-label="Scenario"
        disabled={isSending}
        onChange={(event) => {
          choose(event.target.value);
        }}
        size="sm"
        value={`${branch}${open}`}
      >
        <NativeSelectOption value={branch}>Household</NativeSelectOption>
        {scenarios.open.map((name) => (
          <NativeSelectOption key={name} value={`${branch}${name}`}>
            {name}
          </NativeSelectOption>
        ))}
        <NativeSelectOptGroup label="Scenarios">
          <NativeSelectOption value="new">New scenario…</NativeSelectOption>
          {scenario !== null && (
            <>
              <NativeSelectOption value="compare">
                Compare and decide…
              </NativeSelectOption>
              <NativeSelectOption value="delete">
                Delete scenario…
              </NativeSelectOption>
            </>
          )}
        </NativeSelectOptGroup>
        {(
          [
            ["Decided against", scenarios.rejected],
            ["Made the household", scenarios.adopted],
          ] as const
        ).map(
          ([label, names]) =>
            names.length > 0 && (
              <NativeSelectOptGroup key={label} label={label}>
                {names.map((name) => (
                  <NativeSelectOption key={name} value={`${branch}${name}`}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ),
        )}
      </NativeSelect>
      {asking?.kind === "new" && (
        <EditDialog
          canSave={
            !isSending &&
            asking.name.trim() !== "" &&
            asking.name.trim().length <= longest
          }
          eyebrow="New scenario"
          isSaving={isSending}
          onDismiss={close}
          onSave={() => {
            send(async () => createScenario(asking.name), {
              failure: "Scenario not made",
              onAccepted: close,
              success: (name) => ({
                description: "Edits are saved to the scenario",
                title: `${name} made`,
              }),
            });
          }}
          title={asking.name.trim() === "" ? "Unnamed" : asking.name.trim()}
        >
          <TextField
            hint={`Up to ${String(longest)} characters. Made from ${scenario ?? "the household"} as it stands.`}
            label="Name"
            onValueChange={(name) => {
              setAsking({ kind: "new", name });
            }}
          />
        </EditDialog>
      )}
      {asking?.kind === "delete" && scenario !== null && (
        <ConfirmDialog
          isBusy={isSending}
          onCancel={close}
          onConfirm={() => {
            send(async () => deleteScenario(scenario), {
              failure: "Scenario not deleted",
              onAccepted: close,
              success: () => ({
                description: "Edits are saved to the household",
                title: `${scenario} deleted`,
              }),
            });
          }}
          title={`Delete ${scenario}?`}
        >
          Every save made in it goes with it, and so does any decision kept on
          it. The household is not touched.
        </ConfirmDialog>
      )}
    </>
  );
}
