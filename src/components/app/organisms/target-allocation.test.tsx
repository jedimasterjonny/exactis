import type { RenderResult } from "@testing-library/react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Cma, Mapping } from "@/data/cma";
import type { Allocation } from "@/data/rates";
import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { retargetFromLifeStrategy } from "@/actions/lifestrategy";
import { mapByName, syncTargetsFromPortfolio } from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { targets } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";

import type { PortfolioTargetStatus } from "./target-allocation";

import { TargetAllocation } from "./target-allocation";

vi.mock("@/actions/lifestrategy", () => ({
  retargetFromLifeStrategy: vi.fn(),
}));
vi.mock("@/actions/targets", () => ({
  mapByName: vi.fn(),
  mapCategory: vi.fn(),
  syncTargetsFromPortfolio: vi.fn(),
}));

type RetargetAnswer = Awaited<ReturnType<typeof retargetFromLifeStrategy>>;

// The split the plan holds now, seven tenths in stocks.
const split = { stocks: 0.7 };

// A synced household file status for tests focusing on table, mapping,
// and retargeting.
const syncedStatus: PortfolioTargetStatus = {
  fileName: "northstar.portfolio",
  kind: "synced",
  version: 3,
};

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

// Opens the retarget menu and chooses the fund named.
async function retargetWith(fund = "LifeStrategy 80% Equity"): Promise<void> {
  fireEvent.click(
    screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", {
      name: (name) => name.startsWith(fund),
    }),
  );
}

describe("TargetAllocation", () => {
  it("heads the card as the screen's third section, shows the synced provenance footer, and renders no file picker, download link, caution, or sync button when synced", () => {
    renderCard();

    const card = screen.getByRole("region", { name: "Target allocation" });
    const provenance = within(card).getByRole("paragraph");
    const retarget = within(card).getByRole("button", {
      name: "Retarget from LifeStrategy",
    });

    expect(within(card).getByText("Sect. VI.iii")).toHaveClass("label");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Portfolio Performance file"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download the retargeted file" }),
    ).not.toBeInTheDocument();
    expect(retarget).toBeEnabled();
    expect(retarget).not.toHaveAttribute("aria-describedby");
    expect(provenance).toHaveTextContent(
      "Read from northstar.portfolio on Portfolio. Retargeting updates its Asset Allocation weights in place.",
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
    expect(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    ).toBeEnabled();
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Read from northstar.portfolio on Portfolio. Retargeting updates this scenario only; making it the household updates the portfolio file.",
    );
  });

  it("shows the upload empty state and disables Retarget with empty-state description when no portfolio file is uploaded and no targets are saved", () => {
    renderCard({ portfolioStatus: { kind: "missing" }, targets: null });

    const retarget = screen.getByRole("button", {
      name: "Retarget from LifeStrategy",
    });

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
    expect(retarget).toBeDisabled();
    expect(retarget).toHaveAccessibleDescription(
      "No portfolio file uploaded Upload a binary Portfolio Performance file on Portfolio to load your target allocation.",
    );
  });

  it("shows a legacy upload caution above the card and ties disabled Retarget to it when household targets exist without an uploaded file", () => {
    renderCard({ portfolioStatus: { kind: "missing" } });

    const note = screen.getByRole("note");
    const retarget = screen.getByRole("button", {
      name: "Retarget from LifeStrategy",
    });

    expect(note).toHaveTextContent("No portfolio file uploaded yet");
    expect(note).toHaveTextContent(
      "Upload a binary Portfolio Performance file on Portfolio to keep your target allocation synced.",
    );
    expect(
      within(note).getByRole("link", { name: "Upload on Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(retarget).toBeDisabled();
    expect(retarget).toHaveAccessibleDescription(
      "No portfolio file uploaded yet Upload a binary Portfolio Performance file on Portfolio to keep your target allocation synced.",
    );
  });

  it("keeps Retarget enabled in a scenario with saved targets even when no portfolio file is uploaded, and omits the legacy caution", async () => {
    vi.mocked(retargetFromLifeStrategy).mockResolvedValue(
      saved({ asOf: "2026-08-31", isScenarioOnly: true, split }),
    );
    renderCard({
      branch: "Retire early",
      portfolioStatus: { kind: "missing" },
    });

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    ).toBeEnabled();

    await retargetWith();

    await waitFor(() => {
      expect(retargetFromLifeStrategy).toHaveBeenCalledExactlyOnceWith("9244", {
        on: "Retire early",
      });
    });
  });

  it("shows a refused caution above the card, keeps the table, and ties disabled Retarget to the caution", () => {
    renderCard({
      portfolioStatus: {
        fileName: "broken.portfolio",
        kind: "refused",
        reason: "The file has no Asset Allocation taxonomy, only none",
      },
    });

    const note = screen.getByRole("note");
    const retarget = screen.getByRole("button", {
      name: "Retarget from LifeStrategy",
    });

    expect(note).toHaveTextContent("Portfolio file could not be synced");
    expect(note).toHaveTextContent(
      "The file has no Asset Allocation taxonomy, only none",
    );
    expect(
      screen.queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(retarget).toBeDisabled();
    expect(retarget).toHaveAccessibleDescription(
      "Portfolio file could not be synced The file has no Asset Allocation taxonomy, only none",
    );
  });

  it("shows the refused caution and concise unreadable empty state without repeating the reason when no targets are saved, with Retarget disabled and described by the caution", () => {
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
    const retarget = screen.getByRole("button", {
      name: "Retarget from LifeStrategy",
    });

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
    expect(retarget).toBeDisabled();
    expect(retarget).toHaveAccessibleDescription(
      "Portfolio file could not be synced The file has no Asset Allocation taxonomy, only none",
    );
  });

  it("disables Retarget with a clean accessible description in every scenario state without targets", () => {
    const { rerender } = renderCard({
      branch: "Retire early",
      portfolioStatus: { kind: "missing" },
      targets: null,
    });

    expect(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    ).toHaveAccessibleDescription(
      "No portfolio file uploaded Upload a binary Portfolio Performance file on Portfolio to load your target allocation.",
    );

    rerender(
      <TargetAllocation
        branch="Retire early"
        cma={cma}
        mappings={mappings}
        portfolioStatus={{
          fileName: "northstar.portfolio",
          kind: "unsynced",
          version: 2,
        }}
        split={split}
        targets={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    ).toHaveAccessibleDescription(
      "No allocation synced yet Sync the Asset Allocation taxonomy from your portfolio file.",
    );

    rerender(
      <TargetAllocation
        branch="Retire early"
        cma={cma}
        mappings={mappings}
        portfolioStatus={{
          fileName: "broken.portfolio",
          kind: "refused",
          reason: "The file has no Asset Allocation taxonomy, only none",
        }}
        split={split}
        targets={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    ).toHaveAccessibleDescription(
      "Portfolio file could not be synced The file has no Asset Allocation taxonomy, only none",
    );
  });

  it("places a single default Sync from Portfolio button in the empty state when a readable file has not been synced yet, keeping household Retarget enabled", () => {
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
    expect(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    ).toBeEnabled();
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

  it("retargets the household portfolio file in place on the server, holds busy while running, and reports the effective split", async () => {
    const answer = Promise.withResolvers<RetargetAnswer>();
    vi.mocked(retargetFromLifeStrategy).mockReturnValue(answer.promise);
    renderCard();
    const button = screen.getByRole("button", {
      name: "Retarget from LifeStrategy",
    });

    await retargetWith();

    await waitFor(() => {
      expect(retargetFromLifeStrategy).toHaveBeenCalledExactlyOnceWith("9244", {
        afterVersion: 3,
        on: null,
      });
    });
    expect(button).toHaveAttribute("aria-busy", "true");

    answer.resolve(
      saved({
        asOf: "2026-08-31",
        isScenarioOnly: false,
        savedOn: "2026-09-15",
        split: { stocks: 0.7 },
        version: 4,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Target allocation retargeted" }),
      ).toHaveAccessibleDescription(
        "LifeStrategy 80% Equity as at 31 Aug 2026, at 70% equity and 30% bonds",
      );
    });
  });

  it("surfaces syncWarning when retargeting saves the portfolio file but household auto-sync warns", async () => {
    vi.mocked(retargetFromLifeStrategy).mockResolvedValue(
      saved({
        asOf: "2026-08-31",
        isScenarioOnly: false,
        savedOn: "2026-09-15",
        split: { stocks: 0.8 },
        syncWarning:
          "The household changed while this was being saved, so nothing was",
        version: 4,
      }),
    );
    renderCard({ split: null });

    await retargetWith();

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Target allocation retargeted" }),
      ).toHaveAccessibleDescription(
        "LifeStrategy 80% Equity as at 31 Aug 2026, at 80% equity and 20% bonds. Targets not synced: The household changed while this was being saved, so nothing was",
      );
    });
  });

  it("retargets in a scenario without sending afterVersion and notes that it applies to the scenario only", async () => {
    vi.mocked(retargetFromLifeStrategy).mockResolvedValue(
      saved({
        asOf: "2026-08-31",
        isScenarioOnly: true,
        split: { stocks: 0.7 },
      }),
    );
    renderCard({ branch: "Retire early", portfolioStatus: syncedStatus });

    await retargetWith();

    await waitFor(() => {
      expect(retargetFromLifeStrategy).toHaveBeenCalledExactlyOnceWith("9244", {
        on: "Retire early",
      });
    });
    expect(
      screen.getByRole("dialog", { name: "Target allocation retargeted" }),
    ).toHaveAccessibleDescription(
      "LifeStrategy 80% Equity as at 31 Aug 2026, at 70% equity and 30% bonds. In this scenario only",
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

  it("retargets from a fund holding no bonds all in equities, and says the bonds the plan holds now", async () => {
    vi.mocked(retargetFromLifeStrategy).mockResolvedValue(
      saved({
        asOf: "2026-08-31",
        isScenarioOnly: false,
        savedOn: "2026-09-15",
        split: { stocks: 1 },
        version: 4,
      }),
    );
    renderCard();

    await retargetWith("LifeStrategy 100% Equity");

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Target allocation retargeted" }),
      ).toHaveAccessibleDescription(
        "LifeStrategy 100% Equity as at 31 Aug 2026, at 100% equity and 0% bonds. Holds no bonds; the plan holds 30% now",
      );
    });
    expect(retargetFromLifeStrategy).toHaveBeenCalledExactlyOnceWith("9232", {
      afterVersion: 3,
      on: null,
    });
  });

  it("says why when server-side retargeting is refused", async () => {
    vi.mocked(retargetFromLifeStrategy).mockResolvedValue(
      refused("Vanguard did not send what LifeStrategy 80% Equity holds"),
    );
    renderCard();

    await retargetWith();

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation not retargeted" }),
      ).toHaveAccessibleDescription(
        "Vanguard did not send what LifeStrategy 80% Equity holds",
      );
    });
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
