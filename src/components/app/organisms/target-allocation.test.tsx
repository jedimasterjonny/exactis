import type { RenderResult } from "@testing-library/react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import type { Mapping } from "@/data/cma";
import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { pullLifeStrategy } from "@/actions/lifestrategy";
import { importTargets, mapByName } from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { retargeted } from "@/data/lifestrategy";
import { holdings } from "@/data/lifestrategy.fixture";
import { targets } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";
import { readTargets, reweighted } from "@/lib/portfolio-file";
import {
  clientOf,
  portfolioFile,
  reference,
} from "@/lib/portfolio-file.fixture";

import { TargetAllocation } from "./target-allocation";

vi.mock("@/actions/lifestrategy", () => ({ pullLifeStrategy: vi.fn() }));
vi.mock("@/actions/targets", () => ({
  importTargets: vi.fn(),
  mapByName: vi.fn(),
  mapCategory: vi.fn(),
}));

// The reference taxonomy as Portfolio Performance saves it, and chosen
// as a file on the device.
const saved80 = portfolioFile(clientOf([["Asset Allocation", reference]]));
const chosen = new File([saved80], "PortfolioPerformance.portfolio");

// The split the plan holds now, seven tenths in stocks.
const split = { stocks: 0.7 };

// The file retargeted from what the fixture's LifeStrategy holds, at
// the split, as the card writes it.
const saved70 = reweighted(
  saved80,
  retargeted(readTargets(saved80), holdings, split),
);

// The files this browser has been given to hold, in turn.
const held: Blob[] = [];

// This browser's addresses for the files it holds, which jsdom has none
// of: each file given one in turn, and let go when asked.
class StubUrl extends URL {
  public static override readonly createObjectURL = vi.fn(
    (file: Blob | MediaSource) => {
      held.push(file instanceof Blob ? file : new Blob());
      return `blob:${String(held.length)}`;
    },
  );
  public static override readonly revokeObjectURL = vi.fn();
}

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
function renderCard(held: null | Targets = targets): RenderResult {
  return render(
    <TargetAllocation
      cma={cma}
      mappings={mappings}
      split={split}
      targets={held}
    />,
    { wrapper: Toaster },
  );
}

// The retarget button pressed, then the file picker chosen from with
// the file given.
function retargetWith(file: File): void {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Retarget from LifeStrategy 80% Equity",
    }),
  );
  choose([file]);
}

describe("TargetAllocation", () => {
  it("heads the card as the screen's fifth, offering to reload the targets", () => {
    renderCard();

    const card = screen.getByRole("region", { name: "Target allocation" });

    expect(within(card).getByText("Sect. VI.iii")).toHaveClass("label");
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
      screen.getByText("Import a Portfolio Performance file."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import from Portfolio Performance" }),
    ).toBeEnabled();
  });

  it("says what of the file leaves the browser", () => {
    renderCard(null);

    expect(
      screen.getByText(
        "The file is read in the browser. Only the targets and what each category holds leave it.",
      ),
    ).toBeInTheDocument();
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
    const answer = Promise.withResolvers<Answer<Targets>>();
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
    expect(button).toHaveAttribute("aria-busy", "true");

    answer.resolve(saved({ ...targets, importedOn: "2026-09-15" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Target allocation imported" }),
      ).toHaveAccessibleDescription(
        "From the Asset Allocation taxonomy, as at 15 Sep 2026",
      );
    });
    await waitFor(() => {
      expect(button).not.toHaveAttribute("aria-busy");
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

  it("offers no retargeted file to download before one is retargeted", () => {
    renderCard(null);

    expect(
      screen.queryByRole("link", { name: "Download the retargeted file" }),
    ).not.toBeInTheDocument();
  });

  // The page is drawn again from the store's targets; the file as
  // rewritten is what is imported, and what is offered to download,
  // under the name it was chosen by.
  it("retargets the file chosen from what LifeStrategy holds, imports it as rewritten, and offers it to download", async () => {
    vi.stubGlobal("URL", StubUrl);
    const answer = Promise.withResolvers<Answer<Targets>>();
    vi.mocked(pullLifeStrategy).mockResolvedValue(saved(holdings));
    vi.mocked(importTargets).mockReturnValue(answer.promise);
    const { unmount } = renderCard();
    const button = screen.getByRole("button", {
      name: "Retarget from LifeStrategy 80% Equity",
    });

    retargetWith(chosen);

    await waitFor(() => {
      expect(importTargets).toHaveBeenCalledWith(readTargets(saved70));
    });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", { name: "Reload from Portfolio Performance" }),
    ).not.toHaveAttribute("aria-busy");

    answer.resolve(saved({ ...targets, importedOn: "2026-09-15" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Target allocation retargeted" }),
      ).toHaveAccessibleDescription(
        "LifeStrategy 80% Equity as at 31 Aug 2026, at 70% equity and 30% bonds",
      );
    });
    const link = await screen.findByRole("link", {
      name: "Download the retargeted file",
    });
    const first = link.getAttribute("href") ?? "";
    expect(first).toMatch(/^blob:/);
    expect(link).toHaveAttribute("download", "PortfolioPerformance.portfolio");
    // The zip is stamped with the moment it was written, so the parts
    // are compared rather than the bytes.
    expect(
      unzipSync(
        new Uint8Array(await (held.at(-1) ?? new Blob()).arrayBuffer()),
      ),
    ).toStrictEqual(unzipSync(saved70));
    expect(StubUrl.revokeObjectURL).not.toHaveBeenCalled();

    // Retargeted again, the offer is replaced and the first file let go.
    retargetWith(chosen);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Download the retargeted file" }),
      ).not.toHaveAttribute("href", first);
    });
    const second =
      screen
        .getByRole("link", { name: "Download the retargeted file" })
        .getAttribute("href") ?? "";
    // The first is let go in an effect, which React runs after the
    // commit the new link is read from, and in a turn of its own once
    // the redraw has run past its slice, so it is waited for rather
    // than read off at once.
    await waitFor(() => {
      expect(StubUrl.revokeObjectURL).toHaveBeenCalledWith(first);
    });
    expect(StubUrl.revokeObjectURL).not.toHaveBeenCalledWith(second);

    // Leaving the screen lets the last one go too.
    unmount();

    expect(StubUrl.revokeObjectURL).toHaveBeenCalledWith(second);
  });

  // The file offered would no longer be the allocation the store holds.
  it("takes the retargeted file off when a file is imported as it is", async () => {
    vi.stubGlobal("URL", StubUrl);
    vi.mocked(pullLifeStrategy).mockResolvedValue(saved(holdings));
    vi.mocked(importTargets).mockResolvedValue(
      saved({ ...targets, importedOn: "2026-09-15" }),
    );
    renderCard();

    retargetWith(chosen);
    const link = await screen.findByRole("link", {
      name: "Download the retargeted file",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Reload from Portfolio Performance" }),
    );
    choose([chosen]);

    await waitFor(() => {
      expect(link).not.toBeInTheDocument();
    });
    expect(StubUrl.revokeObjectURL).toHaveBeenCalledWith(
      link.getAttribute("href"),
    );
  });

  // The plan's split being the target allocation's own, the fund is
  // laid at its own four fifths in equities.
  it("retargets at the fund's own split while the plan's is the target allocation's own", async () => {
    vi.stubGlobal("URL", StubUrl);
    vi.mocked(pullLifeStrategy).mockResolvedValue(saved(holdings));
    vi.mocked(importTargets).mockResolvedValue(
      saved({ ...targets, importedOn: "2026-09-15" }),
    );
    render(
      <TargetAllocation
        cma={cma}
        mappings={mappings}
        split={null}
        targets={targets}
      />,
      { wrapper: Toaster },
    );

    retargetWith(chosen);

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Target allocation retargeted" }),
      ).toHaveAccessibleDescription(
        "LifeStrategy 80% Equity as at 31 Aug 2026, at 80% equity and 20% bonds",
      );
    });
    expect(importTargets).toHaveBeenCalledWith(
      readTargets(
        reweighted(saved80, retargeted(readTargets(saved80), holdings, null)),
      ),
    );
  });

  it("says why a file cannot be retargeted before Vanguard is asked, and asks for nothing", async () => {
    renderCard();

    retargetWith(new File(["<?xml version='1.0'?>"], "portfolio.xml"));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation not retargeted" }),
      ).toHaveAccessibleDescription(
        "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read",
      );
    });
    expect(pullLifeStrategy).not.toHaveBeenCalled();
    expect(importTargets).not.toHaveBeenCalled();
  });

  it("says why when Vanguard is refused, and imports nothing", async () => {
    vi.mocked(pullLifeStrategy).mockResolvedValue(
      refused("Vanguard did not send what LifeStrategy 80% Equity holds"),
    );
    renderCard();

    retargetWith(chosen);

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation not retargeted" }),
      ).toHaveAccessibleDescription(
        "Vanguard did not send what LifeStrategy 80% Equity holds",
      );
    });
    expect(importTargets).not.toHaveBeenCalled();
  });

  // The reference has no category for Japan.
  it("says why when no category stands for a fund, and imports nothing", async () => {
    vi.mocked(pullLifeStrategy).mockResolvedValue(
      saved({
        ...holdings,
        funds: [
          ...holdings.funds,
          {
            name: "Vanguard Japan Stock Index Fund",
            sedol: "B50MZ94",
            weight: 0.02,
          },
        ],
      }),
    );
    renderCard();

    retargetWith(chosen);

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation not retargeted" }),
      ).toHaveAccessibleDescription(
        "No category stands for Vanguard Japan Stock Index Fund, which LifeStrategy 80% Equity holds",
      );
    });
    expect(importTargets).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("link", { name: "Download the retargeted file" }),
    ).not.toBeInTheDocument();
  });

  it("says why when the store refuses the retargeted allocation, and offers nothing to download", async () => {
    vi.mocked(pullLifeStrategy).mockResolvedValue(saved(holdings));
    vi.mocked(importTargets).mockResolvedValue(
      refused("A target allocation's categories add up to 100%"),
    );
    renderCard();

    retargetWith(chosen);

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation not retargeted" }),
      ).toHaveAccessibleDescription(
        "A target allocation's categories add up to 100%",
      );
    });
    expect(
      screen.queryByRole("link", { name: "Download the retargeted file" }),
    ).not.toBeInTheDocument();
  });

  // FTSE USA has no class in the reference, and its name
  // suggests US large caps.
  it("offers to map by name the categories it has a class for, holding while it maps, and says how many it mapped", async () => {
    const answer = Promise.withResolvers<Answer<readonly Mapping[]>>();
    vi.mocked(mapByName).mockReturnValue(answer.promise);
    renderCard();
    const map = screen.getByRole("button", { name: "Map 1 by name" });

    fireEvent.click(map);

    expect(mapByName).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(map).toHaveAttribute("aria-busy", "true");
    });

    answer.resolve(
      saved([{ asset: "US large cap equities", category: "north-america" }]),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Classes mapped by name" }),
      ).toHaveAccessibleDescription("1 category mapped");
    });
  });

  // Short-dated gilts is the one category of the reference the table
  // has no name for.
  it("counts every category without a class its name suggests one for, and says how many it mapped", async () => {
    vi.mocked(mapByName).mockResolvedValue(saved(mappings));
    render(
      <TargetAllocation
        cma={cma}
        mappings={[]}
        split={split}
        targets={targets}
      />,
      { wrapper: Toaster },
    );

    fireEvent.click(screen.getByRole("button", { name: "Map 8 by name" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Classes mapped by name" }),
      ).toHaveAccessibleDescription("8 categories mapped");
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
    const ftseUsa = targets.categories.find(({ name }) => name === "FTSE USA");
    const { rerender } = render(
      <TargetAllocation
        cma={cma}
        mappings={[
          ...mappings,
          { asset: "US large cap equities", category: ftseUsa?.id ?? "" },
        ]}
        split={split}
        targets={targets}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /by name$/ }),
    ).not.toBeInTheDocument();

    rerender(
      <TargetAllocation
        cma={null}
        mappings={[]}
        split={split}
        targets={targets}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /by name$/ }),
    ).not.toBeInTheDocument();

    rerender(
      <TargetAllocation cma={cma} mappings={[]} split={split} targets={null} />,
    );

    expect(
      screen.queryByRole("button", { name: /by name$/ }),
    ).not.toBeInTheDocument();
  });
});
