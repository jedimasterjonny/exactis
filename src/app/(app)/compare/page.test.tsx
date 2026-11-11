import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Kept } from "@/data/household";
import type { Compared, Held } from "@/store/household";

import { cma } from "@/data/cma.fixture";
import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
import { atAge } from "@/data/milestones";
import { owners } from "@/data/owners.fixture";
import { portfolios, targets } from "@/data/targets.fixture";
import { forget } from "@/hooks/use-futures";
import { refused, saved } from "@/lib/answer";
import { formatGbp } from "@/lib/money";
import { sideOf } from "@/lib/moved";
import { forkOf, planOver } from "@/lib/plan-over";
import { getCompared } from "@/store/household";

import Compare, { metadata } from "./page";

vi.mock("@/store/household", () => ({ getCompared: vi.fn() }));
vi.mock("@/actions/scenarios", () => ({
  adoptScenario: vi.fn(),
  enterScenario: vi.fn(),
  rejectScenario: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

// What the reference household's owner, born in 1992 and retiring at
// 61, retires on in a scenario, each invented: at 58, at 62, or once
// the plan is worth a trillion pounds, which it never is.
const at58 = [{ ...owners[0], retirement: atAge(58) }];
const at62 = [{ ...owners[0], retirement: atAge(62) }];
const never = [
  {
    ...owners[0],
    retirement: [{ measure: "worth", of: "pounds", times: 1e12 }] as const,
  },
];

// Why an account the household holds that was not in the scenario when
// it was made keeps the two apart, as the merge says it.
const added =
  "The household holds an account that was not in this scenario when it was made, so the scenario cannot be laid over the household; delete the account from the household first, and add it again after if it is still wanted; if this scenario holds it now, redo its changes in a new scenario made from the household instead";

// The reference household with an invented November 2026 vintage and a
// curve the Bank gave on the first of October pulled over its own.
const pulled: Kept = {
  ...kept,
  cma: {
    latest: { ...cma, asOf: "2026-10-30", vintage: { month: 10, year: 2026 } },
    previous: cma,
  },
  curve: {
    asOf: "2026-10-01",
    implied: { 5: 0.0331, 10: 0.0327, 20: 0.0322, 30: 0.0318 },
  },
};

// The household given, or the reference, beside the scenario given as
// the store reads it undecided, laid over the household as its own
// plan, since the two keep the same books.
function comparedOf(scenario: Kept, household: Kept = kept): Compared {
  return {
    decision: null,
    household: { ...heldOf(household), scenario: "", version: 4 },
    over: saved(heldOf(scenario)),
    scenario: saved(soundKept(scenario).kept),
    version: 2,
  };
}

// The page as Compare draws it at the query given.
async function draw(
  query: Record<string, string | string[] | undefined>,
): Promise<void> {
  render(await Compare({ searchParams: Promise.resolve(query) }));
}

// A kept household held as the store holds it, its spread taken away,
// so the futures have nothing to draw and the page's own figures are
// read alone.
function heldOf(household: Kept): Held {
  const held = soundKept(household);
  return {
    ...held,
    household: { ...held.household, spread: { short: "No CMA is pulled" } },
  };
}

// What the header offers to end the comparison, by what each button
// says.
function offered(): (null | string)[] {
  return screen.getAllByRole("button").map(({ textContent }) => textContent);
}

describe("Compare", () => {
  beforeEach(() => {
    forget();
  });

  it("titles the page by a name of its own, since the navigation does not list it", () => {
    expect(metadata).toStrictEqual({ title: "Compare" });
  });

  it("says no scenario is chosen without a name, and reads nothing", async () => {
    await draw({});

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Scenario beside the household",
    );
    expect(screen.getByText("Sect. I · Dashboard")).toHaveClass("label");
    expect(screen.getByText("No scenario chosen")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Open a scenario from the menu on the dashboard, then choose Compare and decide….",
      ),
    ).toBeInTheDocument();

    await draw({ scenario: ["Four-day week", "Bonds sooner"] });

    expect(getCompared).not.toHaveBeenCalled();
  });

  it("says no scenario is kept under a name the store has none by", async () => {
    vi.mocked(getCompared).mockResolvedValue(null);

    await draw({ scenario: "Four-day week" });

    expect(getCompared).toHaveBeenCalledExactlyOnceWith("Four-day week");
    expect(
      screen.getByRole("region", { name: "Beside the household" }),
    ).toHaveTextContent(
      "No scenario is kept under that nameIt may have been deleted. Choose one from the scenario menu on the dashboard.",
    );
  });

  // A scenario retiring the owner at 58, named with space about it.
  it("titles the scenario with how it moves retirement, sets the two side by side and lists what it changes", async () => {
    const scenario = { ...kept, owners: at58 };
    vi.mocked(getCompared).mockResolvedValue(comparedOf(scenario));

    await draw({ scenario: " Four-day week " });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Four-day week brings retirement 3 years sooner, to 58",
    );
    expect(
      screen.getByText("Laid over the household's balances as of August 2026"),
    ).toBeInTheDocument();

    const table = screen.getByRole("table", {
      name: "The scenario beside the household",
    });

    expect(
      within(table).getByRole("rowheader", { name: "Retires at" }),
    ).toHaveAccessibleDescription("3 years sooner");
    expect(
      within(table).getByRole("row", { name: "Retires at 61 58" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("rowheader", { name: "Chance of success" }),
    ).toHaveAccessibleDescription(
      "The household has no spread to draw the futures from · The scenario has no spread to draw the futures from",
    );
    expect(
      within(table).getByRole("row", { name: "Chance of success — —" }),
    ).toBeInTheDocument();

    const theirs = sideOf(kept).worth;
    const ours = sideOf(scenario).worth;

    expect(
      within(table).getByRole("row", {
        name: `Net worth at 91 ${formatGbp(theirs)} ${formatGbp(ours)}`,
      }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("rowheader", { name: "Net worth at 91" }),
    ).toHaveAccessibleDescription(
      `${formatGbp(Math.abs(ours - theirs))} ${ours > theirs ? "more" : "less"}`,
    );

    const changes = screen.getByRole("region", {
      name: "What making it the household changes",
    });

    expect(within(changes).getByText("1 changed")).toBeInTheDocument();
    expect(
      within(changes)
        .getAllByRole("listitem")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Owner · MeChanged"]);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Decided against/u)).not.toBeInTheDocument();
    expect(offered()).toStrictEqual([
      "Make this the household…",
      "Decide against…",
    ]);
  });

  it.each([
    [kept, kept, "leaves retirement at 61"],
    [{ ...kept, owners: at62 }, kept, "brings retirement a year later, to 62"],
    [{ ...kept, owners: never }, kept, "puts retirement out of reach"],
    [
      { ...kept, owners: never },
      { ...kept, owners: never },
      "leaves retirement out of reach",
    ],
    [kept, { ...kept, owners: never }, "brings retirement within reach, at 61"],
  ])(
    "titles a scenario with the verdict on retirement against the household's",
    async (scenario, household, verdict) => {
      vi.mocked(getCompared).mockResolvedValue(comparedOf(scenario, household));

      await draw({ scenario: "Four-day week" });

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        `Four-day week ${verdict}`,
      );
    },
  );

  it("says nothing differs where the scenario's plan is the household's", async () => {
    vi.mocked(getCompared).mockResolvedValue(comparedOf(kept));

    await draw({ scenario: "Four-day week" });

    const changes = screen.getByRole("region", {
      name: "What making it the household changes",
    });

    expect(changes).toHaveTextContent(
      "The same plan as the household'sNothing in the scenario's plan differs from the household's, so its figures are the household's too.",
    );
    expect(within(changes).queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", { name: "Retires at" }),
    ).toHaveAccessibleDescription("The same");
  });

  // The household's allocation imported again on the 26th of September,
  // after the scenario was made, each category holding an invented £500
  // more and a cash reserve listed beneath the bonds asking for nothing,
  // which the household then mapped onto UK cash.
  it("says nothing differs for a scenario made before the household's latest import, nor for a category it lists at 0%", async () => {
    const household = {
      ...kept,
      mappings: [
        ...kept.mappings,
        { asset: "UK cash", category: "Asset Allocation/Bonds/Cash reserve" },
      ],
      targets: {
        categories: [
          ...targets.categories.map((category) => ({
            ...category,
            value: category.value + 500,
          })),
          {
            accounts: [],
            classes: ["Bonds"],
            id: "Asset Allocation/Bonds/Cash reserve",
            isImplemented: false,
            name: "Cash reserve",
            share: 0,
            value: 0,
          },
        ],
        importedOn: "2026-09-26",
        portfolios,
      },
    };
    vi.mocked(getCompared).mockResolvedValue({
      ...comparedOf(kept, household),
      over: saved(heldOf(planOver(household, kept, forkOf(kept)))),
    });

    await draw({ scenario: "Four-day week" });

    expect(
      screen.getByRole("region", {
        name: "What making it the household changes",
      }),
    ).toHaveTextContent(
      "The same plan as the household'sNothing in the scenario's plan differs from the household's, so its figures are the household's too.",
    );
  });

  it("lists the CMA and the curve a scenario pulled since it was made", async () => {
    vi.mocked(getCompared).mockResolvedValue({
      ...comparedOf(pulled),
      over: saved(heldOf(planOver(kept, pulled, forkOf(kept)))),
    });

    await draw({ scenario: "Four-day week" });

    expect(
      within(
        screen.getByRole("region", {
          name: "What making it the household changes",
        }),
      )
        .getAllByRole("listitem")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["BlackRock CMAChanged", "BoE curveChanged"]);
  });

  // The household pulled since the scenario was made, and has opened an
  // account the scenario never held, so the merge is refused.
  it("lists no CMA or curve for a scenario holding older ones, even where the merge is refused", async () => {
    vi.mocked(getCompared).mockResolvedValue({
      ...comparedOf({ ...kept, owners: at58 }, pulled),
      over: refused(added),
    });

    await draw({ scenario: "Four-day week" });

    expect(
      screen.getAllByRole("listitem").map(({ textContent }) => textContent),
    ).toStrictEqual(["Owner · MeChanged"]);
  });

  // A scenario that runs the plan to 95 and retires the owner at 62.
  it("reads the net worth at each plan's end where the two run to different ages", async () => {
    const scenario = { ...kept, ages: { ends: 95 }, owners: at62 };
    vi.mocked(getCompared).mockResolvedValue(comparedOf(scenario));

    await draw({ scenario: "Four-day week" });

    const apart = sideOf(scenario).worth - sideOf(kept).worth;

    expect(
      screen.getByRole("rowheader", { name: "Net worth at each plan's end" }),
    ).toHaveAccessibleDescription(
      `${formatGbp(Math.abs(apart))} ${apart > 0 ? "more" : "less"}, at 95 against 91`,
    );
    expect(
      screen.getByRole("rowheader", { name: "Retires at" }),
    ).toHaveAccessibleDescription("A year later");
  });

  it("says when a scenario was decided against, and why where a reason was given", async () => {
    vi.mocked(getCompared).mockResolvedValue({
      ...comparedOf(kept),
      decision: {
        kind: "rejected",
        on: "2026-11-04",
        reason: "Too tight in the early years",
      },
    });

    await draw({ scenario: "Four-day week" });

    expect(
      screen.getByText(
        "Decided against on 4 Nov 2026 · ‘Too tight in the early years’",
      ),
    ).toBeInTheDocument();
    expect(offered()).toStrictEqual([
      "Make this the household…",
      "Open the scenario",
    ]);

    vi.mocked(getCompared).mockResolvedValue({
      ...comparedOf(kept),
      decision: { kind: "rejected", on: "2026-11-04", reason: null },
    });

    await draw({ scenario: "Four-day week" });

    expect(
      screen.getByText("Decided against on 4 Nov 2026"),
    ).toBeInTheDocument();
  });

  it("shows the record alone of a scenario made the household", async () => {
    vi.mocked(getCompared).mockResolvedValue({
      ...comparedOf(kept),
      decision: {
        kind: "adopted",
        on: "2026-11-04",
        reason: "Fridays are worth it",
      },
      over: null,
    });

    await draw({ scenario: "Four-day week" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Four-day week was made the household",
    );
    expect(
      screen.getByText(
        "Made the household on 4 Nov 2026 · ‘Fridays are worth it’",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Beside the household" }),
    ).toHaveTextContent(
      "Its plan is the household'sThe household has run on it since 4 Nov 2026, so there is nothing to set beside it.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(offered()).toStrictEqual(["Open the scenario"]);
  });

  // The household has opened an account since the scenario was made.
  it("says why a scenario cannot be laid over the household in place of the figures, and still lists what it changes", async () => {
    vi.mocked(getCompared).mockResolvedValue({
      ...comparedOf({ ...kept, owners: at58 }),
      over: refused(added),
    });

    await draw({ scenario: "Four-day week" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Four-day week beside the household",
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      `It cannot be made the household as things stand${added}. What it changes is still listed below.`,
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(offered()).toStrictEqual(["Decide against…"]);
  });

  // Written past the rules, as a scenario kept before they tightened.
  it("says why a scenario the rules refuse cannot be read, and lists nothing", async () => {
    const broken = "A record's id is held by no other record";
    vi.mocked(getCompared).mockResolvedValue({
      ...comparedOf(kept),
      over: refused(broken),
      scenario: refused(broken),
    });

    await draw({ scenario: "Four-day week" });

    expect(screen.getByRole("note")).toHaveTextContent(
      `It cannot be made the household as things stand${broken}.`,
    );
    expect(
      screen.queryByRole("region", {
        name: "What making it the household changes",
      }),
    ).not.toBeInTheDocument();
  });
});
