import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PortfolioSnapshot } from "@/data/portfolio";

import { Toaster } from "@/components/kit/toast";
import { readPortfolioSnapshot } from "@/lib/portfolio-file";
import { samplePortfolioFile } from "@/lib/portfolio-file.fixture";

import { PortfolioPicker } from "./portfolio-picker";

const sampleFile = samplePortfolioFile();

function choose(files: null | readonly File[]): HTMLInputElement {
  const picker = screen.getByLabelText<HTMLInputElement>(
    "Portfolio Performance file",
  );
  fireEvent.change(picker, { target: { files } });
  return picker;
}

describe("PortfolioPicker", () => {
  it("opens the hidden .portfolio file input when clicked", () => {
    render(
      <PortfolioPicker
        label="Open .portfolio file"
        onOpened={vi.fn<(snapshot: PortfolioSnapshot) => void>()}
        variant="default"
      />,
      { wrapper: Toaster },
    );

    const button = screen.getByRole("button", { name: "Open .portfolio file" });
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

  it("parses a chosen binary file in the browser, clears the input, and hands the snapshot back", async () => {
    const onOpened = vi.fn<(snapshot: PortfolioSnapshot) => void>();
    render(<PortfolioPicker label="Switch file" onOpened={onOpened} />, {
      wrapper: Toaster,
    });

    const picker = choose([new File([sampleFile], "northstar.portfolio")]);

    await waitFor(() => {
      expect(onOpened).toHaveBeenCalledWith(
        readPortfolioSnapshot(sampleFile, "northstar.portfolio"),
      );
    });
    expect(picker).toHaveValue("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does nothing when the picker closes without a file, and toasts a refusal on an invalid file", async () => {
    const onOpened = vi.fn<(snapshot: PortfolioSnapshot) => void>();
    render(<PortfolioPicker label="Switch file" onOpened={onOpened} />, {
      wrapper: Toaster,
    });

    choose([]);
    choose(null);

    expect(onOpened).not.toHaveBeenCalled();

    choose([new File(["<client></client>"], "wrong.portfolio")]);

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Portfolio file not opened" }),
      ).toHaveAccessibleDescription(
        "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read",
      );
    });
    expect(onOpened).not.toHaveBeenCalled();
  });
});
