import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { importTargets } from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
import { targets } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";
import { readTargets } from "@/lib/portfolio-file";
import {
  clientOf,
  portfolioFile,
  reference,
} from "@/lib/portfolio-file.fixture";

import { PortfolioImport } from "./portfolio-import";

vi.mock("@/actions/targets", () => ({ importTargets: vi.fn() }));

// The reference taxonomy as Portfolio Performance saves it.
const file = portfolioFile(clientOf([["Asset Allocation", reference]]));

// The file picker, which is not drawn, chosen from with the files
// given, or with none as a picker closed without a choice gives.
function choose(files: null | readonly File[]): HTMLInputElement {
  const picker = screen.getByLabelText<HTMLInputElement>(
    "Portfolio Performance file",
  );
  fireEvent.change(picker, { target: { files } });
  return picker;
}

// The button as the trades' card mounts it. An import reports through
// the toast manager, which needs its Toaster mounted.
function importButton(): HTMLElement {
  render(<PortfolioImport />, { wrapper: Toaster });
  return screen.getByRole("button", {
    name: "Import from Portfolio Performance",
  });
}

describe("PortfolioImport", () => {
  it("opens the file picker, which takes a Portfolio Performance file", () => {
    const button = importButton();
    const picker = screen.getByLabelText<HTMLInputElement>(
      "Portfolio Performance file",
    );
    const open = vi.spyOn(picker, "click").mockImplementation(() => {
      // The device's picker does not open under test.
    });

    fireEvent.click(button);

    expect(open).toHaveBeenCalledOnce();
    expect(picker).toHaveAttribute("accept", ".portfolio");
    expect(picker).toHaveAttribute("type", "file");
  });

  it("reads the file chosen here, sends the store what it reads, and says when the holdings are as at", async () => {
    const answer = Promise.withResolvers<Answer<Targets>>();
    vi.mocked(importTargets).mockReturnValue(answer.promise);
    const button = importButton();

    const picker = choose([new File([file], "Portfolio.portfolio")]);

    await waitFor(() => {
      expect(importTargets).toHaveBeenCalledWith(readTargets(file));
    });
    expect(picker).toHaveValue("");
    expect(button).toHaveAttribute("aria-busy", "true");

    answer.resolve(saved({ ...targets, importedOn: "2026-10-23" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Holdings imported" }),
      ).toHaveAccessibleDescription("As at 23 Oct 2026");
    });
  });

  it("says why when the store refuses, and sends nothing when the picker closes without a file", async () => {
    vi.mocked(importTargets).mockResolvedValue(
      refused("A target allocation's categories add up to 100%"),
    );
    importButton();

    choose([]);
    choose(null);

    expect(importTargets).not.toHaveBeenCalled();

    choose([new File([file], "Portfolio.portfolio")]);

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Holdings not imported" }),
      ).toHaveAccessibleDescription(
        "A target allocation's categories add up to 100%",
      );
    });
  });
});
