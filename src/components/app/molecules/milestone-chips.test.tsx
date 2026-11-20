import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Marker } from "@/data/milestones";
import type { Tie } from "@/data/schedule";

import { bySlot } from "@/test/dom";

import { MilestoneChips } from "./milestone-chips";

const markers: readonly Marker[] = [
  { id: 1, name: "Kids leave home", year: 2040 },
  { id: "retirement", name: "Retirement", year: 2053 },
];

describe("MilestoneChips", () => {
  it("names each milestone and its year in a group, the chosen one pressed in oxide", () => {
    render(
      <MilestoneChips
        markers={markers}
        onSelect={vi.fn<(tie: Tie) => void>()}
        selected="retirement"
      />,
    );

    const group = screen.getByRole("group", { name: "Milestones" });

    expect(
      within(group)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toStrictEqual(["Kids leave home 2040", "Retirement 2053"]);
    expect(
      screen.getByRole("button", { name: "Retirement 2053" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Retirement 2053" })).toHaveClass(
      "bg-brand",
    );
    // jsdom forces no colours, so the classes that do are what is read.
    expect(screen.getByRole("button", { name: "Retirement 2053" })).toHaveClass(
      "forced-colors:bg-[Highlight]",
      "forced-colors:text-[HighlightText]",
      "forced-colors:forced-color-adjust-none",
      "forced-colors:focus-visible:outline-[CanvasText]",
    );
    expect(
      screen.getByRole("button", { name: "Kids leave home 2040" }),
    ).not.toHaveClass("forced-colors:bg-[Highlight]");
    expect(
      screen.getByRole("button", { name: "Kids leave home 2040" }),
    ).toHaveAttribute("aria-pressed", "false");
    // The flag and the year go on a phone, where there is room for the
    // name alone.
    expect(screen.getByText("2040")).toHaveClass("max-sm:hidden");
    expect(
      screen.getAllByText(bySlot("milestone-chip-flag"), { suggest: false }),
    ).toHaveLength(2);
    for (const flag of screen.getAllByText(bySlot("milestone-chip-flag"), {
      suggest: false,
    })) {
      expect(flag).toHaveClass("max-sm:hidden");
    }
  });

  it("draws a milestone yet to be placed dashed, with an ellipsis for its year and no press", () => {
    render(
      <MilestoneChips
        markers={[...markers, { id: 3, name: "First million", reached: null }]}
        onSelect={vi.fn<(tie: Tie) => void>()}
        selected="retirement"
      />,
    );

    const group = screen.getByRole("group", { name: "Milestones" });
    const chip = within(group).getByText(bySlot("milestone-chip-unplaced"), {
      suggest: false,
    });

    expect(within(group).getAllByRole("button")).toHaveLength(2);
    expect(chip).toHaveTextContent("First million …");
    expect(chip).toHaveClass("border-dashed", "text-muted-foreground");
    expect(within(chip).getByText("…")).toHaveClass("max-sm:hidden");
  });

  it("draws a milestone too few futures reach dashed, with the share that do for its year and no press", () => {
    render(
      <MilestoneChips
        markers={[...markers, { id: 3, name: "First million", reached: 0.12 }]}
        onSelect={vi.fn<(tie: Tie) => void>()}
        selected="retirement"
      />,
    );

    const group = screen.getByRole("group", { name: "Milestones" });
    const chip = within(group).getByText(bySlot("milestone-chip-unplaced"), {
      suggest: false,
    });

    expect(within(group).getAllByRole("button")).toHaveLength(2);
    expect(chip).toHaveTextContent("First million reached in 12%");
    expect(chip).toHaveClass("border-dashed", "text-muted-foreground");
    expect(within(chip).getByText("reached in")).toHaveClass("sr-only");
  });

  // The caller gives the order, so a chip placed can stand where it
  // stood unplaced; jsdom lays nothing out, so the class holding a year,
  // an ellipsis and a share to one width is read.
  it("draws the chips in the order given, placed or not, each figure four wide", () => {
    render(
      <MilestoneChips
        markers={[
          { id: 1, name: "Kids leave home", year: 2040 },
          { id: 3, name: "First million", reached: null },
          { id: "retirement", name: "Retirement", year: 2053 },
        ]}
        onSelect={vi.fn<(tie: Tie) => void>()}
        selected="retirement"
      />,
    );

    const group = screen.getByRole("group", { name: "Milestones" });

    expect(
      // eslint-disable-next-line testing-library/no-node-access -- the chips are the group's children, and an unplaced one has no role to query by
      [...group.children].map(({ textContent }) => textContent),
    ).toStrictEqual([
      "Kids leave home 2040",
      "First million …",
      "Retirement 2053",
    ]);
    expect(screen.getByText("2040")).toHaveClass("min-w-[4ch]");
    expect(screen.getByText("…")).toHaveClass("min-w-[4ch]");
  });

  // jsdom lays nothing out, so the class that sizes the reach is read: a
  // box 44px tall about the chip's middle, whatever its border.
  it("reaches 44px tall for a finger about each chip, past its drawn edges", () => {
    render(
      <MilestoneChips
        markers={markers}
        onSelect={vi.fn<(tie: Tie) => void>()}
        selected="retirement"
      />,
    );

    for (const chip of screen.getAllByRole("button")) {
      expect(chip).toHaveClass(
        "h-8",
        "after:absolute",
        "after:inset-y-[calc(50%-22px)]",
      );
    }
  });

  it("reports the milestone a chip chooses", () => {
    const onSelect = vi.fn<(tie: Tie) => void>();
    render(
      <MilestoneChips
        markers={markers}
        onSelect={onSelect}
        selected="retirement"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Kids leave home 2040" }),
    );

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
  });
});
