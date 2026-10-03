import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Mapping } from "@/data/cma";
import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { importTargets, mapByName } from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { targets } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";
import { readTargets } from "@/lib/portfolio-file";
import {
  clientOf,
  portfolioFile,
  reference,
} from "@/lib/portfolio-file.fixture";
import { heldBack } from "@/test/held-back";

import { TargetAllocation } from "./target-allocation";

vi.mock("@/actions/targets", () => ({
  importTargets: vi.fn(),
  mapByName: vi.fn(),
  mapCategory: vi.fn(),
}));

// The reference taxonomy as Portfolio Performance saves it, chosen as
// a file on the device.
const chosen = new File(
  [portfolioFile(clientOf([["Asset Allocation", reference]]))],
  "PortfolioPerformance.portfolio",
);

// The file picker, which is not drawn, chosen from with the files
// given, or with none as a picker closed without a choice gives.
function choose(files: null | readonly File[]): HTMLInputElement {
  const picker = screen.getByLabelText<HTMLInputElement>(
    "Portfolio Performance file",
  );
  fireEvent.change(picker, { target: { files } });
  return picker;
}

// The card over the targets given, the reference's by default, with
// the reference's mappings onto August's vintage. An import reports
// through the toast manager, which needs its Toaster mounted.
function renderCard(held: null | Targets = targets): void {
  render(<TargetAllocation cma={cma} mappings={mappings} targets={held} />, {
    wrapper: Toaster,
  });
}

describe("TargetAllocation", () => {
  it("heads the card as the screen's fifth, saying when the targets were imported", () => {
    renderCard();

    const card = screen.getByRole("region", { name: "Target allocation" });

    expect(within(card).getByText("Sect. V.iii")).toHaveClass("label");
    expect(within(card).getByText("Imported 3 Sep 2026")).not.toHaveClass(
      "label",
    );
    expect(
      within(card).getByRole("button", {
        name: "Reload from Portfolio Performance",
      }),
    ).toBeEnabled();
  });

  it("lays out the categories imported, each with its CMA class", () => {
    renderCard();

    // A row a category, one a group of them, stocks, bonds and those
    // not blended, and the header.
    expect(screen.getAllByRole("row")).toHaveLength(
      targets.categories.length + 3 + 1,
    );
    expect(
      screen.getAllByRole("combobox", { name: "CMA class for UK equity" })[0],
    ).toHaveValue("UK large cap equities");
    expect(
      screen.queryByText("No allocation imported yet"),
    ).not.toBeInTheDocument();
  });

  it("says nothing has been imported before anything is, what would be read, and offers the import", () => {
    renderCard(null);

    expect(screen.getByText("No allocation imported yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Import a Portfolio Performance file to read the target allocation set in its Asset Allocation taxonomy.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Imported/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import from Portfolio Performance" }),
    ).toBeEnabled();
  });

  it("states how a target is worked out and the check the targets pass", () => {
    renderCard(null);

    expect(
      screen.getByText(
        /^A target is its class's weight times the weights of the classes above it in the Asset Allocation taxonomy, and the targets are checked to add up to 100%/,
      ),
    ).toHaveTextContent(
      "only the targets leave it. Each category blends at the 20-year GBP return of its CMA class.",
    );
  });

  it("opens the file picker, which takes a Portfolio Performance file", () => {
    renderCard();

    const picker = screen.getByLabelText<HTMLInputElement>(
      "Portfolio Performance file",
    );
    const open = vi.spyOn(picker, "click").mockImplementation(() => {
      // The device's picker does not open under test.
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Reload from Portfolio Performance" }),
    );

    expect(open).toHaveBeenCalledOnce();
    expect(picker).toHaveAttribute("accept", ".portfolio");
    expect(picker).toHaveAttribute("type", "file");
  });

  // The page is drawn again from the store's targets, which the toast
  // reads.
  it("reads the file chosen here, sends the store its categories alone, and says what was imported", async () => {
    const answer = heldBack<Answer<Targets>>();
    vi.mocked(importTargets).mockReturnValue(answer.promise);
    renderCard();

    const button = screen.getByRole("button", {
      name: "Reload from Portfolio Performance",
    });
    const picker = choose([chosen]);

    await waitFor(() => {
      expect(importTargets).toHaveBeenCalledWith(
        readTargets(portfolioFile(clientOf([["Asset Allocation", reference]]))),
      );
    });
    expect(picker).toHaveValue("");
    expect(button).toBeDisabled();

    answer.answer(saved({ ...targets, importedOn: "2026-09-15" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Target allocation imported" }),
      ).toHaveAccessibleDescription(
        "From the Asset Allocation taxonomy, as at 15 Sep 2026",
      );
    });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });

  it("says why a file cannot be read, and sends nothing", async () => {
    renderCard();

    choose([new File(["<?xml version='1.0'?>"], "portfolio.xml")]);

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation not imported" }),
      ).toHaveAccessibleDescription(
        "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read",
      );
    });
    expect(importTargets).not.toHaveBeenCalled();
  });

  it("says why when the store refuses the targets", async () => {
    vi.mocked(importTargets).mockResolvedValue(
      refused("A target allocation's categories add up to 100%"),
    );
    renderCard(null);

    choose([chosen]);

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation not imported" }),
      ).toHaveAccessibleDescription(
        "A target allocation's categories add up to 100%",
      );
    });
  });

  it("sends nothing when the picker closes without a file", () => {
    renderCard();

    choose([]);
    choose(null);

    expect(importTargets).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Reload from Portfolio Performance" }),
    ).toBeEnabled();
  });

  // FTSE North America has no class in the reference, and its name
  // suggests US large caps.
  it("offers to map by name the categories it has a class for, holding while it maps, and says how many it mapped", async () => {
    const answer = heldBack<Answer<readonly Mapping[]>>();
    vi.mocked(mapByName).mockReturnValue(answer.promise);
    renderCard();
    const map = screen.getByRole("button", { name: "Map 1 by name" });

    fireEvent.click(map);

    expect(mapByName).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(map).toBeDisabled();
    });

    answer.answer(
      saved([{ asset: "US large cap equities", category: "north-america" }]),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Classes mapped by name" }),
      ).toHaveAccessibleDescription(
        "1 category mapped onto the class its name suggests",
      );
    });
  });

  // Short-dated gilts is the one category of the reference the table
  // has no name for.
  it("counts every category without a class its name suggests one for, and says how many it mapped", async () => {
    vi.mocked(mapByName).mockResolvedValue(saved(mappings));
    render(<TargetAllocation cma={cma} mappings={[]} targets={targets} />, {
      wrapper: Toaster,
    });

    fireEvent.click(screen.getByRole("button", { name: "Map 8 by name" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Classes mapped by name" }),
      ).toHaveAccessibleDescription(
        "8 categories mapped onto the class its name suggests",
      );
    });
  });

  it("says why when mapping by name is refused", async () => {
    vi.mocked(mapByName).mockResolvedValue(
      refused("No category without a class has one suggested"),
    );
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Map 1 by name" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Classes not mapped" }),
      ).toHaveAccessibleDescription(
        "No category without a class has one suggested",
      );
    });
  });

  it("offers no mapping by name with nothing to map, no CMA or no allocation", () => {
    const northAmerica = targets.categories.find(
      ({ name }) => name === "FTSE North America",
    );
    const { rerender } = render(
      <TargetAllocation
        cma={cma}
        mappings={[
          ...mappings,
          { asset: "US large cap equities", category: northAmerica?.id ?? "" },
        ]}
        targets={targets}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /by name$/ }),
    ).not.toBeInTheDocument();

    rerender(<TargetAllocation cma={null} mappings={[]} targets={targets} />);

    expect(
      screen.queryByRole("button", { name: /by name$/ }),
    ).not.toBeInTheDocument();

    rerender(<TargetAllocation cma={cma} mappings={[]} targets={null} />);

    expect(
      screen.queryByRole("button", { name: /by name$/ }),
    ).not.toBeInTheDocument();
  });
});
