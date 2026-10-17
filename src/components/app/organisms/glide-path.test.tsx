import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Anchor } from "@/data/rates";

import { removeAnchor, saveAnchor } from "@/actions/plan";
import { Toaster } from "@/components/kit/toast";
import { retiring } from "@/data/income.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field } from "@/test/dom";

import { GlidePath } from "./glide-path";

vi.mock("@/actions/plan", () => ({
  removeAnchor: vi.fn(),
  saveAnchor: vi.fn(),
}));

// Fifteen points of bonds at 52, which falls in 2044, and 40 at 60, in 2052.
const glide: readonly Anchor[] = [
  { age: 52, bonds: 0.15 },
  { age: 60, bonds: 0.4 },
];

// The glide path given over a plan opening in 2026 at 34, holding three
// fifths in stocks now unless the path says otherwise. Save and delete
// report through the toast manager, which needs its Toaster mounted.
function renderPath(anchors: readonly Anchor[] = glide): void {
  render(
    <GlidePath glide={anchors} plan={retiring} split={{ stocks: 0.6 }} />,
    { wrapper: Toaster },
  );
}

describe("GlidePath", () => {
  it("draws the glide path and lists its anchors, each with a pencil and a bin", () => {
    renderPath();

    const section = screen.getByRole("region", { name: "Glide path" });

    expect(within(section).getByText("Sect. VI.iv")).toHaveClass("label");
    expect(within(section).getByRole("application")).toHaveClass(
      "recharts-surface",
    );
    expect(
      within(section)
        .getAllByRole("row")
        .slice(1)
        .map((row) => row.textContent),
    ).toStrictEqual(["52204415.00%", "60205240.00%"]);
    expect(
      within(section).getByRole("button", { name: "Edit anchor at 60" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Delete anchor at 52" }),
    ).toBeInTheDocument();
  });

  it("says there is no glide path yet rather than drawing an empty chart and table", () => {
    renderPath([]);

    const section = screen.getByRole("region", { name: "Glide path" });

    expect(within(section).getByText("No glide path yet")).toBeInTheDocument();
    expect(within(section).queryByRole("table")).not.toBeInTheDocument();
    expect(within(section).queryByRole("application")).not.toBeInTheDocument();
  });

  // A new anchor opens at the owner's 34 and the fifteen points the path
  // holds there, and each is typed over.
  it("adds an anchor at an age and a share in bonds, saving it alone, and reports it", async () => {
    renderPath();
    vi.mocked(saveAnchor).mockResolvedValue(saved({ age: 75, bonds: 0.25 }));

    fireEvent.click(screen.getByRole("button", { name: "Add anchor" }));

    const dialog = screen.getByRole("dialog", { name: "Anchor at 34" });

    expect(within(dialog).getByText("New anchor")).toHaveClass("text-brand");
    expect(field("Age", dialog)).toHaveValue("34");
    expect(field("Bonds", dialog)).toHaveValue("15.00%");
    expect(field("Bonds", dialog)).toHaveAccessibleDescription(
      "The rest in equities",
    );

    commit(field("Age", dialog), "75");
    commit(field("Bonds", dialog), "25");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveAnchor).toHaveBeenCalledExactlyOnceWith(null, {
      age: 75,
      bonds: 0.25,
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Anchor at 75" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Anchor at 75 saved" }),
    ).toHaveAccessibleDescription("25.00% in bonds");
  });

  // With no anchors the plan holds three fifths in stocks for life, so a
  // first anchor saved as it opens moves nothing.
  it("opens a first anchor at the split the plan holds now", () => {
    renderPath([]);

    fireEvent.click(screen.getByRole("button", { name: "Add anchor" }));

    expect(field("Bonds", screen.getByRole("dialog"))).toHaveValue("40.00%");
  });

  // Moved from 60 to 62, the anchor at 60 goes and one at 62 takes its
  // place.
  it("opens an anchor as it is and writes it back in place of the one at its old age", async () => {
    renderPath();
    vi.mocked(saveAnchor).mockResolvedValue(saved({ age: 62, bonds: 0.4 }));

    fireEvent.click(screen.getByRole("button", { name: "Edit anchor at 60" }));

    const dialog = screen.getByRole("dialog", { name: "Anchor at 60" });

    expect(within(dialog).getByText("Edit anchor")).toHaveClass("text-brand");
    expect(field("Bonds", dialog)).toHaveValue("40.00%");

    commit(field("Age", dialog), "62");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveAnchor).toHaveBeenCalledExactlyOnceWith(60, {
      age: 62,
      bonds: 0.4,
    });
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Anchor at 62 saved" }),
      ).toBeInTheDocument();
    });
  });

  it("keeps the dialog open and says why when the store refuses the anchor", async () => {
    renderPath();
    vi.mocked(saveAnchor).mockResolvedValue(
      refused("An age holds one anchor, youngest first"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit anchor at 60" }));
    commit(field("Age", screen.getByRole("dialog")), "52");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Anchor not saved" }),
      ).toHaveAccessibleDescription("An age holds one anchor, youngest first");
    });
    expect(
      screen.getByRole("dialog", { name: "Anchor at 52" }),
    ).toBeInTheDocument();
  });

  it("drops a cancelled draft and saves nothing", () => {
    renderPath();

    fireEvent.click(screen.getByRole("button", { name: "Edit anchor at 52" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveAnchor).not.toHaveBeenCalled();
  });

  it("asks before deleting an anchor, and deletes it on confirm", async () => {
    renderPath();
    vi.mocked(removeAnchor).mockResolvedValue(saved(undefined));

    fireEvent.click(
      screen.getByRole("button", { name: "Delete anchor at 60" }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "Delete the anchor at 60?",
    });

    expect(dialog).toHaveAccessibleDescription(
      "The plan holds the path through the anchors left.",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(removeAnchor).toHaveBeenCalledExactlyOnceWith(60);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Anchor at 60 deleted" }),
    ).toHaveAccessibleDescription("40.00% in bonds");
  });

  it("keeps the question open and says why when the store refuses the deletion", async () => {
    renderPath();
    vi.mocked(removeAnchor).mockResolvedValue(
      refused("No anchor is at that age"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Delete anchor at 60" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Anchor not deleted" }),
      ).toHaveAccessibleDescription("No anchor is at that age");
    });
    expect(
      screen.getByRole("alertdialog", { name: "Delete the anchor at 60?" }),
    ).toBeInTheDocument();
  });

  it("drops the question on cancel and deletes nothing", () => {
    renderPath();

    fireEvent.click(
      screen.getByRole("button", { name: "Delete anchor at 60" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(removeAnchor).not.toHaveBeenCalled();
  });
});
