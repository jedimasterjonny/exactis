import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Answer } from "@/lib/answer";
import type { SavedPortfolio } from "@/store/portfolio";

import { uploadPortfolio } from "@/actions/portfolio";
import { Toaster } from "@/components/kit/toast";
import { maxPortfolioBytes, portfolioTooLarge } from "@/data/portfolio";
import { refused, saved } from "@/lib/answer";
import { samplePortfolioFile } from "@/lib/portfolio-file.fixture";

import { PortfolioUpload } from "./portfolio-upload";

vi.mock("@/actions/portfolio", () => ({ uploadPortfolio: vi.fn() }));

const sampleBytes = samplePortfolioFile();

function choose(files: null | readonly File[]): HTMLInputElement {
  const picker = screen.getByLabelText<HTMLInputElement>(
    "Portfolio Performance file",
  );
  fireEvent.change(picker, { target: { files } });
  return picker;
}

function replaceDialog(): HTMLElement {
  return screen.getByRole("alertdialog", { name: "Replace portfolio file?" });
}

async function toasted(title: string, description: string): Promise<void> {
  await waitFor(() => {
    expect(
      screen.getByRole("dialog", { name: title }),
    ).toHaveAccessibleDescription(description);
  });
}

describe("PortfolioUpload", () => {
  it("opens the hidden .portfolio file picker on trigger click and ignores empty dismissal", () => {
    render(<PortfolioUpload version={0} />, { wrapper: Toaster });

    const picker = screen.getByLabelText<HTMLInputElement>(
      "Portfolio Performance file",
    );
    const open = vi.spyOn(picker, "click").mockImplementation(() => {
      // The device's picker does not open under test.
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Upload .portfolio file" }),
    );

    expect(open).toHaveBeenCalledOnce();
    expect(picker).toHaveAttribute("accept", ".portfolio");
    expect(picker).toHaveAttribute("type", "file");

    choose(null);
    choose([]);
    expect(uploadPortfolio).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("uploads immediately on initial selection, locks controls while busy, and toasts on success", async () => {
    let resolveUpload: (answer: Answer<SavedPortfolio>) => void = () => {
      // Replaced by the deferred promise below.
    };
    vi.mocked(uploadPortfolio).mockImplementation(
      async () =>
        new Promise<Answer<SavedPortfolio>>((resolve) => {
          resolveUpload = resolve;
        }),
    );

    render(<PortfolioUpload version={0} />, { wrapper: Toaster });

    const file = new File([sampleBytes], "northstar.portfolio");
    const picker = choose([file]);

    expect(picker).toHaveValue("");
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Upload .portfolio file" }),
      ).toHaveAttribute("aria-busy", "true");
    });
    expect(picker).toBeDisabled();

    resolveUpload(
      saved({
        fileName: "northstar.portfolio",
        savedOn: "2026-09-25",
        version: 1,
      }),
    );

    await toasted("Portfolio file uploaded", "Stored with the household");
    const formData = vi.mocked(uploadPortfolio).mock.calls[0]?.[0];
    expect(formData?.get("afterVersion")).toBe("0");
    expect(formData?.get("file")).toBe(file);
  });

  it("surfaces server refusal during initial upload under an error toast", async () => {
    vi.mocked(uploadPortfolio).mockResolvedValue(
      refused("The file is saved as XML"),
    );

    render(<PortfolioUpload version={0} />, { wrapper: Toaster });

    choose([new File([sampleBytes], "bad.portfolio")]);

    await toasted("Portfolio file not uploaded", "The file is saved as XML");
    expect(uploadPortfolio).toHaveBeenCalledOnce();
  });

  it("refuses oversized files immediately on selection in both initial and replace modes without opening ConfirmDialog", async () => {
    const oversized = new File(
      [new Uint8Array(maxPortfolioBytes + 1)],
      "huge.portfolio",
    );

    const { rerender } = render(<PortfolioUpload version={0} />, {
      wrapper: Toaster,
    });
    choose([oversized]);

    await toasted("Portfolio file not uploaded", portfolioTooLarge);
    expect(uploadPortfolio).not.toHaveBeenCalled();

    rerender(
      <PortfolioUpload currentFileName="northstar.portfolio" version={1} />,
    );
    choose([oversized]);

    await toasted("Portfolio file not replaced", portfolioTooLarge);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(uploadPortfolio).not.toHaveBeenCalled();
  });

  it("asks before replacing with incoming/current names, same-name copy, and preview warning, and sends on confirm", async () => {
    vi.mocked(uploadPortfolio).mockResolvedValue(
      saved({
        fileName: "updated.portfolio",
        savedOn: "2026-09-25",
        version: 2,
      }),
    );

    const { rerender } = render(
      <PortfolioUpload currentFileName="northstar.portfolio" version={1} />,
      { wrapper: Toaster },
    );

    // Different filename without preview entries.
    const different = new File([sampleBytes], "updated.portfolio");
    choose([different]);
    expect(replaceDialog()).toHaveAccessibleDescription(
      "updated.portfolio replaces northstar.portfolio for the household, kept as the next version. Download .portfolio first to keep a copy of the current file.",
    );

    // Cancel closes the dialog and sends nothing.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(uploadPortfolio).not.toHaveBeenCalled();

    // Same filename with unsaved preview entries.
    rerender(
      <PortfolioUpload
        currentFileName="northstar.portfolio"
        hasPreview
        version={1}
      />,
    );
    const same = new File([sampleBytes], "northstar.portfolio");
    choose([same]);
    expect(replaceDialog()).toHaveAccessibleDescription(
      "This replaces northstar.portfolio for the household, kept as the next version. Download .portfolio first to keep a copy of the current file. Unsaved preview entries in this tab will be cleared.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    await toasted(
      "Portfolio file replaced",
      "Kept as the next version for the household",
    );
    const formData = vi.mocked(uploadPortfolio).mock.calls[0]?.[0];
    expect(formData?.get("afterVersion")).toBe("1");
    expect(formData?.get("file")).toBe(same);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("closes ConfirmDialog on a server refusal during replace", async () => {
    vi.mocked(uploadPortfolio).mockResolvedValue(
      refused("The file is encrypted"),
    );

    render(
      <PortfolioUpload currentFileName="northstar.portfolio" version={1} />,
      { wrapper: Toaster },
    );

    choose([new File([sampleBytes], "locked.portfolio")]);
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    await toasted("Portfolio file not replaced", "The file is encrypted");
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("keeps ConfirmDialog open on a thrown network error and succeeds on retry", async () => {
    vi.mocked(uploadPortfolio)
      .mockRejectedValueOnce(new Error("Network offline"))
      .mockResolvedValueOnce(
        saved({
          fileName: "retry.portfolio",
          savedOn: "2026-09-25",
          version: 2,
        }),
      );

    render(
      <PortfolioUpload currentFileName="northstar.portfolio" version={1} />,
      { wrapper: Toaster },
    );

    const file = new File([sampleBytes], "retry.portfolio");
    choose([file]);
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    await toasted("Portfolio file not replaced", "Network offline");
    expect(replaceDialog()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    await toasted(
      "Portfolio file replaced",
      "Kept as the next version for the household",
    );
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(uploadPortfolio).toHaveBeenCalledTimes(2);
  });

  it("keeps Replace file busy and the hidden input disabled if ConfirmDialog is dismissed mid-flight", async () => {
    let resolveUpload: (answer: Answer<SavedPortfolio>) => void = () => {
      // Replaced by the deferred promise below.
    };
    vi.mocked(uploadPortfolio).mockImplementation(
      async () =>
        new Promise<Answer<SavedPortfolio>>((resolve) => {
          resolveUpload = resolve;
        }),
    );

    render(
      <PortfolioUpload currentFileName="northstar.portfolio" version={1} />,
      { wrapper: Toaster },
    );

    const picker = choose([new File([sampleBytes], "slow.portfolio")]);
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Replace" })).toHaveAttribute(
        "aria-busy",
        "true",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Replace file…" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(picker).toBeDisabled();

    resolveUpload(
      saved({ fileName: "slow.portfolio", savedOn: "2026-09-25", version: 2 }),
    );

    await toasted(
      "Portfolio file replaced",
      "Kept as the next version for the household",
    );
    await waitFor(() => {
      expect(picker).toBeEnabled();
    });
  });

  it("auto-unmounts ConfirmDialog when the stored version advances or isDisabled turns true", () => {
    const { rerender } = render(
      <PortfolioUpload currentFileName="northstar.portfolio" version={1} />,
      { wrapper: Toaster },
    );

    choose([new File([sampleBytes], "next.portfolio")]);
    expect(replaceDialog()).toBeInTheDocument();

    rerender(
      <PortfolioUpload currentFileName="other-tab.portfolio" version={2} />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    choose([new File([sampleBytes], "next.portfolio")]);
    expect(replaceDialog()).toBeInTheDocument();

    rerender(
      <PortfolioUpload
        currentFileName="other-tab.portfolio"
        isDisabled
        version={2}
      />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("disables trigger and hidden input and wires aria-describedby when disabled in a scenario", () => {
    render(
      <>
        <p id="scenario-note">Leave the scenario to replace the file.</p>
        <PortfolioUpload
          currentFileName="northstar.portfolio"
          describedBy="scenario-note"
          isDisabled
          version={1}
        />
      </>,
      { wrapper: Toaster },
    );

    const trigger = screen.getByRole("button", { name: "Replace file…" });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAccessibleDescription(
      "Leave the scenario to replace the file.",
    );
    expect(screen.getByLabelText("Portfolio Performance file")).toBeDisabled();
  });
});
