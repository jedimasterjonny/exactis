import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  adoptScenario,
  createScenario,
  deleteScenario,
  enterScenario,
  leaveScenario,
} from "@/actions/scenarios";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";
import { field, openDialog } from "@/test/dom";

import { ScenarioMenu } from "./scenario-menu";

vi.mock("@/actions/scenarios", () => ({
  adoptScenario: vi.fn(),
  createScenario: vi.fn(),
  deleteScenario: vi.fn(),
  enterScenario: vi.fn(),
  leaveScenario: vi.fn(),
}));

// Chooses an option of the menu by what it reports.
function choose(value: string): void {
  fireEvent.change(menu(), { target: { value } });
}

// The menu's select.
function menu(): HTMLSelectElement {
  return screen.getByRole<HTMLSelectElement>("combobox", { name: "Scenario" });
}

// The menu over two scenarios kept, the one named open or the household
// where none is. Each answer reports through the toast manager, which
// needs its Toaster mounted.
function renderMenu(scenario: null | string = "Retire early"): void {
  render(
    <ScenarioMenu names={["Move house", "Retire early"]} scenario={scenario} />,
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

describe("ScenarioMenu", () => {
  it("offers the household and each scenario kept, the one open chosen, then what can be done there", () => {
    renderMenu();

    expect(menu()).toHaveValue("branch:Retire early");
    expect(
      within(menu())
        .getAllByRole("option")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Household",
      "Move house",
      "Retire early",
      "New scenario…",
      "Make this the household…",
      "Delete scenario…",
    ]);
  });

  it("offers nothing to make the household or delete while the household is open", () => {
    renderMenu(null);

    expect(menu()).toHaveValue("branch:");
    expect(
      within(menu())
        .getAllByRole("option")
        .map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Household",
      "Move house",
      "Retire early",
      "New scenario…",
    ]);
  });

  it("opens the scenario chosen, and says so", async () => {
    vi.mocked(enterScenario).mockResolvedValue(saved("Move house"));
    renderMenu();

    choose("branch:Move house");

    expect(enterScenario).toHaveBeenCalledExactlyOnceWith("Move house");
    await toasted("Move house opened", "Edits are saved to the scenario");
  });

  it("opens the household chosen by leaving the scenario, and says so", async () => {
    vi.mocked(leaveScenario).mockResolvedValue();
    renderMenu();

    choose("branch:");

    expect(leaveScenario).toHaveBeenCalledOnce();
    await toasted("Household opened", "Edits are saved to the household");
  });

  it("stays on the branch open and says why when the store refuses the one chosen", async () => {
    vi.mocked(enterScenario).mockResolvedValue(
      refused("No scenario is kept under that name"),
    );
    renderMenu();

    choose("branch:Move house");

    await toasted("Scenario not opened", "No scenario is kept under that name");
    expect(menu()).toHaveValue("branch:Retire early");
  });

  it("makes a scenario of the name typed, from the branch open, and says so", async () => {
    vi.mocked(createScenario).mockResolvedValue(saved("Move house"));
    renderMenu();

    choose("new");

    const dialog = openDialog();
    const save = within(dialog).getByRole("button", { name: "Save" });

    // The dialog hides the page behind it from the accessibility tree.
    expect(
      screen.getByRole("combobox", { hidden: true, name: "Scenario" }),
    ).toHaveValue("branch:Retire early");
    expect(field("Name", dialog)).toHaveAccessibleDescription(
      "Up to 40 characters. Made from Retire early as it stands.",
    );
    expect(save).toBeDisabled();

    fireEvent.change(field("Name", dialog), {
      target: { value: "x".repeat(41) },
    });

    expect(save).toBeDisabled();

    fireEvent.change(field("Name", dialog), {
      target: { value: " Move house " },
    });
    fireEvent.click(save);

    expect(createScenario).toHaveBeenCalledExactlyOnceWith(" Move house ");
    await toasted("Move house made", "Edits are saved to the scenario");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Move house" }),
      ).not.toBeInTheDocument();
    });
  });

  it("makes a new scenario from the household while it is open", () => {
    renderMenu(null);

    choose("new");

    expect(field("Name", openDialog())).toHaveAccessibleDescription(
      "Up to 40 characters. Made from the household as it stands.",
    );
  });

  it("keeps the new scenario's dialog open and says why when the store refuses it", async () => {
    vi.mocked(createScenario).mockResolvedValue(
      refused("A scenario is kept under that name already"),
    );
    renderMenu();

    choose("new");
    fireEvent.change(field("Name", openDialog()), {
      target: { value: "Move house" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await toasted(
      "Scenario not made",
      "A scenario is kept under that name already",
    );
    expect(
      screen.getByRole("dialog", { name: "Move house" }),
    ).toBeInTheDocument();
  });

  it("makes the scenario open the household once asked, saying what that replaces", async () => {
    vi.mocked(adoptScenario).mockResolvedValue(saved(undefined));
    renderMenu();

    choose("adopt");

    const question = screen.getByRole("alertdialog", {
      name: "Make Retire early the household?",
    });

    expect(question).toHaveAccessibleDescription(
      "The household's plan is replaced by the scenario's. Its balances, progress points and pulled figures stay as they stand, and the scenario is deleted.",
    );

    fireEvent.click(
      within(question).getByRole("button", { name: "Make the household" }),
    );

    expect(adoptScenario).toHaveBeenCalledExactlyOnceWith("Retire early");
    await toasted(
      "Retire early is the household",
      "Edits are saved to the household",
    );
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("deletes the scenario open once asked", async () => {
    vi.mocked(deleteScenario).mockResolvedValue(saved(undefined));
    renderMenu();

    choose("delete");

    const question = screen.getByRole("alertdialog", {
      name: "Delete Retire early?",
    });

    expect(question).toHaveAccessibleDescription(
      "Every save made in it goes with it. The household is not touched.",
    );

    fireEvent.click(within(question).getByRole("button", { name: "Delete" }));

    expect(deleteScenario).toHaveBeenCalledExactlyOnceWith("Retire early");
    await toasted("Retire early deleted", "Edits are saved to the household");
  });

  it("keeps the question open and says why when the store refuses the deletion", async () => {
    vi.mocked(deleteScenario).mockRejectedValue(new Error("The store is down"));
    renderMenu();

    choose("delete");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await toasted("Scenario not deleted", "The store is down");
    expect(
      screen.getByRole("alertdialog", { name: "Delete Retire early?" }),
    ).toBeInTheDocument();
  });

  it("drops a question or a new name on cancel and sends nothing", () => {
    renderMenu();

    choose("adopt");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    choose("new");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(adoptScenario).not.toHaveBeenCalled();
    expect(createScenario).not.toHaveBeenCalled();
  });
});
