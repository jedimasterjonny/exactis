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
