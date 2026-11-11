import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Answer } from "@/lib/answer";
import type { Decision } from "@/store/household";

import {
  adoptScenario,
  enterScenario,
  rejectScenario,
} from "@/actions/scenarios";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";
import { field, openDialog } from "@/test/dom";

import { ScenarioDecision } from "./scenario-decision";

const push = vi.hoisted(() => vi.fn());

vi.mock("@/actions/scenarios", () => ({
  adoptScenario: vi.fn(),
  enterScenario: vi.fn(),
  rejectScenario: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: (): { readonly push: typeof push } => ({ push }),
}));

// The versions the page deciding was drawn from, invented.
const shown = { household: 4, scenario: 2 };

// The buttons the decision offers, by what they say.
function offered(): (null | string)[] {
  return screen.getAllByRole("button").map(({ textContent }) => textContent);
}

// The decision on Four-day week, undecided and able to be made the
// household unless said otherwise, under a title that takes the focus
// as the screen's does. Each answer reports through the toast manager,
// which needs its Toaster mounted.
function renderDecision(
  decision: Decision["kind"] | null = null,
  isAdoptable = true,
): void {
  render(
    <>
      <h1 tabIndex={-1}>Four-day week beside the household</h1>
      <ScenarioDecision
        decision={decision}
        isAdoptable={isAdoptable}
        name="Four-day week"
        shown={shown}
      />
    </>,
    { wrapper: Toaster },
  );
}

// What a toast says: its title and the line beneath it.
async function toasted(title: string, description: string): Promise<void> {
  await waitFor(() => {
    expect(
      screen.getByRole("dialog", { name: title }),
    ).toHaveAccessibleDescription(description);
  });
}

describe("ScenarioDecision", () => {
  it.each<[Decision["kind"] | null, boolean, readonly string[]]>([
    [null, true, ["Make this the household…", "Decide against…"]],
    [null, false, ["Decide against…"]],
    ["rejected", true, ["Make this the household…", "Open the scenario"]],
    ["rejected", false, ["Open the scenario"]],
    ["adopted", false, ["Open the scenario"]],
  ])(
    "offers what a scenario so decided can be, and never the same decision twice",
    (decision, isAdoptable, buttons) => {
      renderDecision(decision, isAdoptable);

      expect(offered()).toStrictEqual(buttons);
    },
  );

  it("makes the scenario the household once asked, with why, and hands the focus to the title", async () => {
    vi.mocked(adoptScenario).mockResolvedValue(saved(true));
    renderDecision();

    fireEvent.click(
      screen.getByRole("button", { name: "Make this the household…" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Make Four-day week the household?",
    });

    // The dialog hands the focus to its first field a frame after it
    // opens. Deciding before that frame, as no one can, lets it land
    // after the title has the focus and before the dialog is gone, so it
    // takes the focus into a field about to be removed.
    await waitFor(() => {
      expect(field("Why", dialog)).toHaveFocus();
    });

    expect(within(dialog).getByText("Scenario")).toHaveClass("text-brand");
    expect(dialog).toHaveAccessibleDescription(
      "The scenario's plan, its target allocation included, replaces the household's. The household keeps its own balances, progress points and house prices, whatever the scenario holds. The BlackRock CMA, the BoE curve and the holdings imported are each the newer of the two. The scenario is kept under Made the household.",
    );
    expect(field("Why", dialog)).toHaveAccessibleDescription(
      "Optional, up to 200 characters. Kept with the decision, to read back later.",
    );

    fireEvent.change(field("Why", dialog), {
      target: { value: "Fridays are worth it" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Make the household" }),
    );

    expect(adoptScenario).toHaveBeenCalledExactlyOnceWith(
      "Four-day week",
      shown,
      "Fridays are worth it",
    );
    await toasted(
      "Four-day week is the household",
      "Edits are saved to the household",
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Make Four-day week the household?",
        }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("says the scenario is left undecided where the household was replaced but its decision not kept", async () => {
    vi.mocked(adoptScenario).mockResolvedValue(saved(false));
    renderDecision("rejected");

    fireEvent.click(
      screen.getByRole("button", { name: "Make this the household…" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Make the household" }));

    expect(adoptScenario).toHaveBeenCalledExactlyOnceWith(
      "Four-day week",
      shown,
      "",
    );
    await toasted(
      "Four-day week is the household",
      "Edits are saved to the household; the scenario's decision could not be kept, so it is left undecided",
    );
  });

  it("decides against the scenario once asked, a blank reason sent as typed", async () => {
    vi.mocked(rejectScenario).mockResolvedValue(saved(undefined));
    renderDecision();

    fireEvent.click(screen.getByRole("button", { name: "Decide against…" }));

    const dialog = screen.getByRole("dialog", {
      name: "Decide against Four-day week?",
    });

    expect(dialog).toHaveAccessibleDescription(
      "The household is not touched. The scenario is kept under Decided against in the scenario menu, and can be opened again from there.",
    );

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Decide against" }),
    );

    expect(rejectScenario).toHaveBeenCalledExactlyOnceWith(
      "Four-day week",
      shown,
      "",
    );
    await toasted(
      "Decided against Four-day week",
      "Kept in the scenario menu, under Decided against",
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /\?$/u }),
      ).not.toBeInTheDocument();
    });
  });

  it("holds the confirm while the reason runs past 200 characters", () => {
    renderDecision();

    fireEvent.click(screen.getByRole("button", { name: "Decide against…" }));

    const dialog = openDialog();
    const confirm = within(dialog).getByRole("button", {
      name: "Decide against",
    });

    fireEvent.change(field("Why", dialog), {
      target: { value: "x".repeat(201) },
    });

    expect(confirm).toBeDisabled();

    fireEvent.change(field("Why", dialog), {
      target: { value: `  ${"x".repeat(200)} ` },
    });

    expect(confirm).toBeEnabled();
  });

  it("keeps the dialog open and says why when the store refuses the decision", async () => {
    vi.mocked(rejectScenario).mockResolvedValue(
      refused(
        "The scenario changed while this was being decided, so nothing was",
      ),
    );
    renderDecision();

    fireEvent.click(screen.getByRole("button", { name: "Decide against…" }));
    fireEvent.click(screen.getByRole("button", { name: "Decide against" }));

    await toasted(
      "Decision not kept",
      "The scenario changed while this was being decided, so nothing was",
    );
    expect(
      screen.getByRole("dialog", { name: "Decide against Four-day week?" }),
    ).toBeInTheDocument();
  });

  // The answer is settled before the test ends, since an action still
  // on its way holds every transition after it, the next test's too.
  it("holds every button while a decision is on its way to the store", async () => {
    const answer = Promise.withResolvers<Answer<boolean>>();
    vi.mocked(adoptScenario).mockReturnValue(answer.promise);
    renderDecision();

    fireEvent.click(
      screen.getByRole("button", { name: "Make this the household…" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Make the household" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Make the household" }),
      ).toHaveAttribute("aria-busy", "true");
    });
    expect(
      screen.getByRole("button", { hidden: true, name: "Decide against…" }),
    ).toBeDisabled();

    answer.resolve(saved(true));

    await toasted(
      "Four-day week is the household",
      "Edits are saved to the household",
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Decide against…" }),
      ).toBeEnabled();
    });
  });

  it("opens a decided scenario on the dashboard, saying it takes no edits", async () => {
    vi.mocked(enterScenario).mockResolvedValue(saved("Four-day week"));
    renderDecision("adopted", false);

    fireEvent.click(screen.getByRole("button", { name: "Open the scenario" }));

    expect(enterScenario).toHaveBeenCalledExactlyOnceWith("Four-day week");
    await toasted(
      "Four-day week opened",
      "It is decided, so it takes no edits; make a new scenario from it to change it",
    );
    expect(push).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("stays put and says why when the scenario cannot be opened", async () => {
    vi.mocked(enterScenario).mockResolvedValue(
      refused("No scenario is kept under that name"),
    );
    renderDecision("rejected");

    fireEvent.click(screen.getByRole("button", { name: "Open the scenario" }));

    await toasted("Scenario not opened", "No scenario is kept under that name");
    expect(push).not.toHaveBeenCalled();
  });

  it("drops the question on cancel and sends nothing", () => {
    renderDecision();

    fireEvent.click(screen.getByRole("button", { name: "Decide against…" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(rejectScenario).not.toHaveBeenCalled();
  });

  // Decided where the screen has no title to hand the focus to.
  it("hands the focus nowhere where there is no title", async () => {
    vi.mocked(rejectScenario).mockResolvedValue(saved(undefined));
    render(
      <ScenarioDecision
        decision={null}
        isAdoptable={false}
        name="Four-day week"
        shown={shown}
      />,
      { wrapper: Toaster },
    );

    fireEvent.click(screen.getByRole("button", { name: "Decide against…" }));
    fireEvent.click(screen.getByRole("button", { name: "Decide against" }));

    await toasted(
      "Decided against Four-day week",
      "Kept in the scenario menu, under Decided against",
    );
    expect(document.body).toHaveFocus();
  });
});
