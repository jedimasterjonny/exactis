import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import type { JSX } from "react";

import { House, Scale } from "lucide-react";

import type { Household } from "@/data/household";
import type { Side } from "@/lib/moved";
import type { Slot } from "@/lib/slot";
import type { Decision } from "@/store/household";

import { EmptyState } from "@/components/app/molecules/empty-state";
import { ScenarioDecision } from "@/components/app/organisms/scenario-decision";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Screen } from "@/components/app/templates/screen";
import { CardContent } from "@/components/kit/card";
import { formatDay } from "@/lib/months";
import { changedIn, sideOf } from "@/lib/moved";
import { dashboard, sectionLabel, subsectionLabel } from "@/lib/nav";
import { getCompared } from "@/store/household";

import { CompareScreen } from "./compare-screen";

// Compare is reached from the scenario menu rather than the navigation,
// so it is titled by a name of its own rather than a label there.
export const metadata: Metadata = { title: "Compare" };

// What each decision is called where the header says when it was made.
const decisionNames: Record<Decision["kind"], string> = {
  adopted: "Made the household",
  rejected: "Decided against",
};

// The title the screen gives while it has no scenario to compare.
const unnamed = "Scenario beside the household";

// A scenario set beside the household, at /compare?scenario= and its
// name, read from the store behind the session as making it the
// household would leave it: its plan laid over the household's
// balances, progress points and pulled figures as they stand. It is
// reached from the scenario menu rather than the navigation, so it
// takes the dashboard's label and lights no screen there. The title
// gives the answer, how the scenario moves retirement at each plan's
// own rates, worked out here with what each plan comes to and what it
// changes, so no kept household reaches the browser; the screen beside
// the route draws the futures the chance of success is read over. A
// scenario decided against carries the day and the reason in the meta
// line. One made the household shows its record alone, since the
// household runs on its plan and laid over it again it would read the
// household's edits since backwards. Where the merge or the scenario is
// refused, the screen says why and draws no figures, and the lines
// still show where the scenario can be read. The header's actions end
// the comparison, in a decision sent against the versions of the
// household and the scenario read here, or open a scenario decided
// already. No name, or a name no scenario is kept under, says so in a
// card. The page renders behind the loading screen beside it.
export default async function Compare({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>): Promise<JSX.Element> {
  const { scenario: named } = await searchParams;
  if (typeof named !== "string") {
    return (
      <Unshown
        description="Open a scenario from the menu on the dashboard, then choose Compare and decide…."
        icon={Scale}
        title="No scenario chosen"
      />
    );
  }
  const compared = await getCompared(named);
  if (compared === null) {
    return (
      <Unshown
        description="It may have been deleted. Choose one from the scenario menu on the dashboard."
        icon={Scale}
        title="No scenario is kept under that name"
      />
    );
  }
  const name = named.trim();
  const { decision, household, over, scenario } = compared;
  const shown = { household: household.version, scenario: compared.version };
  if (over === null) {
    return (
      <Unshown
        actions={
          <ScenarioDecision
            decision={decision.kind}
            isAdoptable={false}
            name={name}
            shown={shown}
          />
        }
        description={`The household has run on it since ${formatDay(decision.on)}, so there is nothing to set beside it.`}
        icon={House}
        meta={metaOf(decision)}
        title="Its plan is the household's"
        titled={`${name} was made the household`}
      />
    );
  }
  const theirs = sideOf(household.kept);
  const merged =
    over.kind === "saved"
      ? { ...drawnOf(over.value.household), side: sideOf(over.value.kept) }
      : null;
  return (
    <CompareScreen
      actions={
        <ScenarioDecision
          decision={decision?.kind ?? null}
          isAdoptable={merged !== null}
          name={name}
          shown={shown}
        />
      }
      asOf={household.kept.asOf}
      household={{ ...drawnOf(household.household), side: theirs }}
      lines={
        scenario.kind === "saved"
          ? changedIn(household.kept, scenario.value)
          : null
      }
      meta={decision === null ? undefined : metaOf(decision)}
      refusal={over.kind === "refused" ? over.reason : null}
      scenario={merged}
      title={titleOf(name, theirs, merged?.side ?? null)}
    />
  );
}

// What a side's futures are drawn over, out of the household it makes:
// all the run reads, rather than the whole household carried to the
// browser.
function drawnOf({
  accounts,
  plan,
  schedule,
  spread,
}: Household): Pick<Household, "accounts" | "plan" | "schedule" | "spread"> {
  return { accounts, plan, schedule, spread };
}

// When the decision was made, and why, where a reason was given.
function metaOf({ kind, on, reason }: Decision): string {
  const made = `${decisionNames[kind]} on ${formatDay(on)}`;
  return reason === null ? made : `${made} · ‘${reason}’`;
}

// The title, which gives the answer: how the scenario moves retirement
// from the household's, into reach or out of it, or leaves it where it
// was; or, where the scenario cannot be laid over the household, its
// name beside it.
function titleOf(name: string, theirs: Side, ours: null | Side): string {
  if (ours === null) {
    return `${name} beside the household`;
  }
  if (ours.retires === null) {
    return theirs.retires === null
      ? `${name} leaves retirement out of reach`
      : `${name} puts retirement out of reach`;
  }
  const age = String(ours.retires);
  if (theirs.retires === null) {
    return `${name} brings retirement within reach, at ${age}`;
  }
  if (theirs.retires === ours.retires) {
    return `${name} leaves retirement at ${age}`;
  }
  const years = ours.retires - theirs.retires;
  const count = Math.abs(years);
  const span = count === 1 ? "a year" : `${String(count)} years`;
  return `${name} brings retirement ${span} ${years < 0 ? "sooner" : "later"}, to ${age}`;
}

// The screen with nothing to set beside the household: no scenario
// named, none kept by the name, or one made the household, saying so in
// a card under its title.
function Unshown({
  actions,
  description,
  icon,
  meta,
  title,
  titled = unnamed,
}: {
  readonly actions?: Slot;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly meta?: string;
  readonly title: string;
  readonly titled?: string;
}): JSX.Element {
  return (
    <Screen
      actions={actions}
      label={sectionLabel(dashboard)}
      meta={meta}
      title={titled}
    >
      <SectionCard
        label={subsectionLabel(dashboard, 1)}
        title="Beside the household"
      >
        <CardContent>
          <EmptyState description={description} icon={icon} title={title} />
        </CardContent>
      </SectionCard>
    </Screen>
  );
}
