import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { importHousehold } from "@/actions/household";
import { SidebarProvider } from "@/components/kit/sidebar";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";
import { stubViewport } from "@/test/dom";

import { HouseholdImport } from "./household-import";

vi.mock("@/actions/household", () => ({ importHousehold: vi.fn() }));

// A household file chosen on the device.
const chosen = new File(['{"shape":1}'], "exactis-household-2026-09-15.json");

// The file picker, which is not drawn, chosen from with the files given,
// or with none as a picker closed without a choice gives.
function choose(files: null | readonly File[]): HTMLInputElement {
  const picker = screen.getByLabelText<HTMLInputElement>("Household file");
  fireEvent.change(picker, { target: { files } });
  return picker;
}

// The question asked before a file chosen is imported.
function question(): HTMLElement {
  return screen.getByRole("alertdialog", { name: "Import this file?" });
}

// The import in the sidebar it sits in, which reads the viewport, and
// under the toast manager it reports through.
function renderImport(): void {
  stubViewport(1024);
  render(
    <SidebarProvider>
      <HouseholdImport />
    </SidebarProvider>,
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

describe("HouseholdImport", () => {
  it("opens the file picker, which takes a JSON file", () => {
    renderImport();

    const picker = screen.getByLabelText<HTMLInputElement>("Household file");
    const open = vi.spyOn(picker, "click").mockImplementation(() => {
      // The device's picker does not open under test.
    });

    fireEvent.click(screen.getByRole("button", { name: "Import file…" }));

    expect(open).toHaveBeenCalledOnce();
    expect(picker).toHaveAttribute("accept", "application/json,.json");
    expect(picker).toHaveAttribute("type", "file");
  });

  it("asks before importing the file chosen, saying what it replaces and keeps", () => {
    renderImport();

    const picker = choose([chosen]);

    expect(picker).toHaveValue("");
    expect(question()).toHaveAccessibleDescription(
      "What is open is replaced by the file, kept as the next version. Export first to keep a copy of what is open.",
    );
  });

  it("sends the file's text once asked, and says it was kept", async () => {
    vi.mocked(importHousehold).mockResolvedValue(saved(undefined));
    renderImport();

    choose([chosen]);
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await toasted("File imported", "Kept as the next version of what is open");
    expect(importHousehold).toHaveBeenCalledExactlyOnceWith('{"shape":1}');
    expect(
      screen.queryByRole("alertdialog", { name: "Import this file?" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the question open and says why when the store refuses the file", async () => {
    vi.mocked(importHousehold).mockResolvedValue(
      refused("A plan is somebody's"),
    );
    renderImport();

    choose([chosen]);
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await toasted("File not imported", "A plan is somebody's");
    expect(question()).toBeInTheDocument();
  });

  it("says why a file chosen cannot be read, and sends nothing", async () => {
    vi.spyOn(chosen, "text").mockRejectedValue(
      new Error("The file could not be read"),
    );
    renderImport();

    choose([chosen]);
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    await toasted("File not imported", "The file could not be read");
    expect(importHousehold).not.toHaveBeenCalled();
  });

  it("sends nothing on cancel, nor when the picker is closed without a choice", () => {
    renderImport();

    choose(null);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    choose([chosen]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(importHousehold).not.toHaveBeenCalled();
  });
});
