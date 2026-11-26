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

import type { Cma, Mapping } from "@/data/cma";
import type { Allocation } from "@/data/rates";
import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { pullLifeStrategy } from "@/actions/lifestrategy";
import {
  importTargets,
  mapByName,
  syncTargetsFromPortfolio,
} from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { range, retargeted } from "@/data/lifestrategy";
import { holdings } from "@/data/lifestrategy.fixture";
import { targets } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";
import { readTargets, reweighted } from "@/lib/portfolio-file";
import {
  clientOf,
  portfolioFile,
  reference,
} from "@/lib/portfolio-file.fixture";

import type { PortfolioTargetStatus } from "./target-allocation";

import { TargetAllocation } from "./target-allocation";

vi.mock("@/actions/lifestrategy", () => ({ pullLifeStrategy: vi.fn() }));
vi.mock("@/actions/targets", () => ({
  importTargets: vi.fn(),
  mapByName: vi.fn(),
  mapCategory: vi.fn(),
  syncTargetsFromPortfolio: vi.fn(),
}));

// The reference taxonomy as Portfolio Performance saves it, and chosen
// as a file on the device.
const saved80 = portfolioFile(clientOf([["Asset Allocation", reference]]));
const chosen = new File([saved80], "northstar.portfolio");

// The split the plan holds now, seven tenths in stocks.
const split = { stocks: 0.7 };

// A synced household file status for tests focusing on table, mapping,
// and retargeting.
const syncedStatus: PortfolioTargetStatus = {
  fileName: "northstar.portfolio",
  kind: "synced",
  version: 3,
};

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

// The card over the props given, defaulting to synced household targets
// with August's CMA and the reference's mappings.
function renderCard({
  branch = null,
  cma: chosenCma = cma,
  mappings: chosenMappings = mappings,
  portfolioStatus = syncedStatus,
  split: chosenSplit = split,
  targets: chosenTargets = targets,
}: {
  readonly branch?: null | string;
  readonly cma?: Cma | null;
  readonly mappings?: readonly Mapping[];
  readonly portfolioStatus?: PortfolioTargetStatus;
  readonly split?: Allocation | null;
  readonly targets?: null | Targets;
} = {}): RenderResult {
  return render(
    <TargetAllocation
      branch={branch}
      cma={chosenCma}
      mappings={chosenMappings}
      portfolioStatus={portfolioStatus}
      split={chosenSplit}
      targets={chosenTargets}
    />,
    { wrapper: Toaster },
  );
}

// The retarget menu opened and the fund named chosen from it, then the
// file picker chosen from with the file given.
async function retargetWith(
  file: File,
  fund = "LifeStrategy 80% Equity",
): Promise<void> {
  fireEvent.click(
    screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", {
      name: (name) => name.startsWith(fund),
    }),
  );
  choose([file]);
}

describe("TargetAllocation", () => {
  it("heads the card as the screen's third section, shows the synced provenance footer, and renders no caution or sync button when synced", () => {
    renderCard();

    const card = screen.getByRole("region", { name: "Target allocation" });
    const provenance = within(card).getByRole("paragraph");

    expect(within(card).getByText("Sect. VI.iii")).toHaveClass("label");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByRole("button", {
        name: /from Portfolio Performance/,
      }),
    ).not.toBeInTheDocument();
    expect(provenance).toHaveTextContent(
      "Read from northstar.portfolio on Portfolio.",
    );
    expect(provenance).toHaveClass("min-w-0", "wrap-anywhere");
    expect(
      within(card).getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
  });

  it("lays out the categories synced, each with its CMA class", () => {
    renderCard();

    // A row a category, one a group of them, stocks, bonds and those
    // not blended, and the header.
    expect(screen.getAllByRole("row")).toHaveLength(
      targets.categories.length + 3 + 1,
    );
    expect(
      screen.getAllByRole("combobox", { name: "CMA class for UK equity" })[0],
    ).toHaveValue("UK large cap equities");
  });

  it("renders no caution or sync button when a scenario is intentionally retargeted and notes scenario isolation in the footer", () => {
    renderCard({
      branch: "Retire early",
      portfolioStatus: {
        fileName: "northstar.portfolio",
        kind: "retargeted",
        version: 4,
      },
    });

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Read from northstar.portfolio on Portfolio. Changes here apply to this scenario only.",
    );
  });

  it("shows the upload empty state and footer when no portfolio file is uploaded and no targets are saved", () => {
    renderCard({ portfolioStatus: { kind: "missing" }, targets: null });

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByText("No portfolio file uploaded")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Upload a binary Portfolio Performance file on Portfolio to load your target allocation.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Upload a portfolio file on Portfolio to feed the target allocation.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Upload on Portfolio" })
        .map((link) => link.getAttribute("href")),
    ).toStrictEqual(["/portfolio", "/portfolio"]);
  });

  it("shows a legacy upload caution above the card when household targets exist without an uploaded file", () => {
    renderCard({ portfolioStatus: { kind: "missing" } });

    const note = screen.getByRole("note");

    expect(note).toHaveTextContent("No portfolio file uploaded yet");
    expect(note).toHaveTextContent(
      "Upload a binary Portfolio Performance file on Portfolio to keep your target allocation synced.",
    );
    expect(
      within(note).getByRole("link", { name: "Upload on Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("omits the legacy upload caution in a scenario when no portfolio file is uploaded", () => {
    renderCard({
      branch: "Retire early",
      portfolioStatus: { kind: "missing" },
    });

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows a refused caution above the card and keeps the table when existing targets remain readable", () => {
    renderCard({
      portfolioStatus: {
        fileName: "broken.portfolio",
        kind: "refused",
        reason: "The file has no Asset Allocation taxonomy, only none",
      },
    });

    const note = screen.getByRole("note");

    expect(note).toHaveTextContent("Portfolio file could not be synced");
    expect(note).toHaveTextContent(
      "The file has no Asset Allocation taxonomy, only none",
    );
    expect(
      screen.queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows the refused caution and concise unreadable empty state without repeating the reason when no targets are saved", () => {
    renderCard({
      portfolioStatus: {
        fileName: "broken.portfolio",
        kind: "refused",
        reason: "The file has no Asset Allocation taxonomy, only none",
      },
      targets: null,
    });

    const note = screen.getByRole("note");
    const card = screen.getByRole("region", { name: "Target allocation" });

    expect(note).toHaveTextContent("Portfolio file could not be synced");
    expect(note).toHaveTextContent(
      "The file has no Asset Allocation taxonomy, only none",
    );
    expect(
      within(card).getByText("Allocation could not be read"),
    ).toBeInTheDocument();
    expect(
      within(card).getByText(
        "Fix the file on Portfolio to load your target allocation.",
      ),
    ).toBeInTheDocument();
    expect(
      within(card).queryByText(
        "The file has no Asset Allocation taxonomy, only none",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(card)
        .getAllByRole("link", { name: "Open Portfolio" })
        .map((link) => link.getAttribute("href")),
    ).toStrictEqual(["/portfolio", "/portfolio"]);
    expect(
      screen.queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
  });

  it("places a single default Sync from Portfolio button in the empty state when a readable file has not been synced yet", () => {
    renderCard({
      portfolioStatus: {
        fileName: "northstar.portfolio",
        kind: "unsynced",
        version: 1,
      },
      targets: null,
    });

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByText("No allocation synced yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sync the Asset Allocation taxonomy from your portfolio file.",
      ),
    ).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", {
      name: "Sync from Portfolio",
    });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveClass("bg-primary");
  });

  it("shows the household unsynced caution above the card and syncs from the header button", async () => {
    vi.mocked(syncTargetsFromPortfolio).mockResolvedValue(
      saved({ ...targets, importedOn: "2026-09-25" }),
    );
    renderCard({
      portfolioStatus: {
        fileName: "northstar.portfolio",
        kind: "unsynced",
        version: 4,
      },
    });

    const note = screen.getByRole("note");
    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    expect(note).toHaveTextContent(
      "Portfolio file has newer targets or holdings",
    );
    expect(note).toHaveTextContent("Sync from Portfolio to update this plan.");
    expect(button).toBeEnabled();
    expect(button).toHaveClass("border-border");

    fireEvent.click(button);

    await waitFor(() => {
      expect(syncTargetsFromPortfolio).toHaveBeenCalledExactlyOnceWith(null);
    });
  });

  it("shows scenario-specific copy and passes the scenario branch when syncing in a scenario", async () => {
    vi.mocked(syncTargetsFromPortfolio).mockResolvedValue(
      saved({ ...targets, importedOn: "2026-09-25" }),
    );
    renderCard({
      branch: "Retire early",
      portfolioStatus: {
        fileName: "northstar.portfolio",
        kind: "unsynced",
        version: 4,
      },
    });

    const note = screen.getByRole("note");
    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    expect(note).toHaveTextContent(
      "Portfolio file has newer holdings or categories",
    );
    expect(note).toHaveTextContent(
      "Syncing pulls the household's latest holdings and target weights into this scenario.",
    );
    expect(button).toBeEnabled();

    fireEvent.click(button);

    await waitFor(() => {
      expect(syncTargetsFromPortfolio).toHaveBeenCalledExactlyOnceWith(
        "Retire early",
      );
    });
  });

  it("disables Sync from Portfolio and ties it to the blocker caution when live CMA rates prevent syncing", () => {
    const blockedReason =
      "Emerging markets small cap has no CMA class, so this allocation cannot be synced while the plan runs on the CMA's rates";
    renderCard({
      portfolioStatus: {
        blockedReason,
        fileName: "northstar.portfolio",
        kind: "unsynced",
        version: 4,
      },
    });

    const note = screen.getByRole("note");
    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    expect(note).toHaveTextContent("Portfolio file has unsynced changes");
    expect(note).toHaveTextContent(blockedReason);
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      `Portfolio file has unsynced changes ${blockedReason}`,
    );
  });

  it("sends nothing when the retarget file picker closes without a file", () => {
    renderCard();

    choose([]);
    choose(null);

    expect(pullLifeStrategy).not.toHaveBeenCalled();
    expect(importTargets).not.toHaveBeenCalled();
  });

  it("offers no retargeted file to download before one is retargeted", () => {
    renderCard({ portfolioStatus: { kind: "missing" }, targets: null });

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
      name: "Retarget from LifeStrategy",
    });

    await retargetWith(chosen);

    await waitFor(() => {
      expect(importTargets).toHaveBeenCalledWith(readTargets(saved70), []);
    });
    expect(pullLifeStrategy).toHaveBeenCalledWith("9244");
    expect(button).toHaveAttribute("aria-busy", "true");

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
    expect(link).toHaveAttribute("download", "northstar.portfolio");
    // The zip is stamped with the moment it was written, so the parts
    // are compared rather than the bytes.
    expect(
      unzipSync(
        new Uint8Array(await (held.at(-1) ?? new Blob()).arrayBuffer()),
      ),
    ).toStrictEqual(unzipSync(saved70));
    expect(StubUrl.revokeObjectURL).not.toHaveBeenCalled();

    // Retargeted again, the offer is replaced and the first file let go.
    await retargetWith(chosen);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Download the retargeted file" }),
      ).not.toHaveAttribute("href", first);
    });
    const second =
      screen
        .getByRole("link", { name: "Download the retargeted file" })
        .getAttribute("href") ?? "";
    await waitFor(() => {
      expect(StubUrl.revokeObjectURL).toHaveBeenCalledWith(first);
    });
    expect(StubUrl.revokeObjectURL).not.toHaveBeenCalledWith(second);

    // Leaving the screen lets the last one go too.
    unmount();

    expect(StubUrl.revokeObjectURL).toHaveBeenCalledWith(second);
  });

  // The plan's split being the target allocation's own, the fund is
  // laid at its own four fifths in equities.
  it("retargets at the fund's own split while the plan's is the target allocation's own", async () => {
    vi.stubGlobal("URL", StubUrl);
    vi.mocked(pullLifeStrategy).mockResolvedValue(saved(holdings));
    vi.mocked(importTargets).mockResolvedValue(
      saved({ ...targets, importedOn: "2026-09-15" }),
    );
    renderCard({ split: null });

    await retargetWith(chosen);

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
      [],
    );
  });

  // At seven tenths in stocks, LifeStrategy 80% Equity is laid at the
  // plan's split, and LifeStrategy 100% Equity, holding no bonds, says
  // it sets aside the 30% the plan holds in them.
  it("offers each fund of the range, saying the split it would be laid at, and flags one holding no bonds while the plan holds some", async () => {
    renderCard();

    fireEvent.click(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    );

    expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent),
    ).toStrictEqual([
      "LifeStrategy 80% EquityAt 70% equity and 30% bonds",
      "LifeStrategy 100% EquityHolds no bonds; the plan holds 30% now",
    ]);
    expect(screen.getByText("At 70% equity and 30% bonds")).toHaveClass(
      "text-muted-foreground",
    );
    expect(
      screen.getByText("Holds no bonds; the plan holds 30% now"),
    ).toHaveClass("text-caution");
  });

  // The plan's split being the target allocation's own, each fund is
  // laid at its own, and retargeting moves the plan with it, so there is
  // nothing to flag.
  it("offers each fund at its own split, flagging nothing, while the plan's split is the target allocation's own", async () => {
    renderCard({ split: null });

    fireEvent.click(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    );

    expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent),
    ).toStrictEqual([
      "LifeStrategy 80% EquityAt 80% equity and 20% bonds",
      "LifeStrategy 100% EquityAt 100% equity and 0% bonds",
    ]);
  });

  it("flags nothing while the plan holds no bonds either", async () => {
    renderCard({ split: { stocks: 1 } });

    fireEvent.click(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    );

    expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent),
    ).toStrictEqual([
      "LifeStrategy 80% EquityAt 100% equity and 0% bonds",
      "LifeStrategy 100% EquityAt 100% equity and 0% bonds",
    ]);
  });

  // LifeStrategy 100% Equity holding the fixture's four equity funds and
  // no bonds, the file is laid all in equities whatever the plan's
  // split, and the toast says what of it is set aside.
  it("retargets from a fund holding no bonds all in equities, and says the bonds the plan holds now", async () => {
    vi.stubGlobal("URL", StubUrl);
    const equities = {
      ...holdings,
      fund: range[1],
      funds: holdings.funds.slice(0, 4),
    };
    vi.mocked(pullLifeStrategy).mockResolvedValue(saved(equities));
    vi.mocked(importTargets).mockResolvedValue(
      saved({ ...targets, importedOn: "2026-09-15" }),
    );
    renderCard();

    await retargetWith(chosen, "LifeStrategy 100% Equity");

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Target allocation retargeted" }),
      ).toHaveAccessibleDescription(
        "LifeStrategy 100% Equity as at 31 Aug 2026, at 100% equity and 0% bonds. Holds no bonds; the plan holds 30% now",
      );
    });
    expect(pullLifeStrategy).toHaveBeenCalledWith("9232");
    expect(importTargets).toHaveBeenCalledWith(
      readTargets(
        reweighted(saved80, retargeted(readTargets(saved80), equities, split)),
      ),
      [],
    );
  });

  it("says why a file cannot be retargeted before Vanguard is asked, and asks for nothing", async () => {
    renderCard();

    await retargetWith(new File(["<?xml version='1.0'?>"], "portfolio.xml"));

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

    await retargetWith(chosen);

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

    await retargetWith(chosen);

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

    await retargetWith(chosen);

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
    renderCard({ mappings: [] });

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
    const { rerender } = renderCard({
      mappings: [
        ...mappings,
        { asset: "US large cap equities", category: ftseUsa?.id ?? "" },
      ],
    });

    expect(
      screen.queryByRole("button", { name: /by name$/ }),
    ).not.toBeInTheDocument();

    rerender(
      <TargetAllocation
        branch={null}
        cma={null}
        mappings={[]}
        portfolioStatus={syncedStatus}
        split={split}
        targets={targets}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /by name$/ }),
    ).not.toBeInTheDocument();

    rerender(
      <TargetAllocation
        branch={null}
        cma={cma}
        mappings={[]}
        portfolioStatus={{ kind: "missing" }}
        split={split}
        targets={null}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /by name$/ }),
    ).not.toBeInTheDocument();
  });
});
