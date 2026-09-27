import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { retiring } from "@/data/income.fixture";
import { milestones } from "@/data/milestones.fixture";
import { bySlot } from "@/test/dom";

import { MilestoneList } from "./milestone-list";

describe("MilestoneList", () => {
  // The plan runs from 2026 to 2083, so the children leave home 14 of
  // its 57 years in, the owner retires in 2053, 27 years in, and the
  // downsize is 33 years in.
  it("lists the milestones in the order they come, retirement among them, each pinned on the plan's span", () => {
    render(<MilestoneList milestones={milestones} plan={retiring} />);

    const section = screen.getByRole("region", { name: "Milestones" });

    expect(within(section).getByText("Sect. III.i")).toHaveClass("label");
    // A row is drawn in its folded lines and again in its columns, only
    // one of which is on screen at any width, so each name is found
    // twice, one row after another.
    expect(
      within(section)
        .getAllByText(/^(Kids leave home|Retirement|Downsize)$/)
        .map((name) => name.textContent),
    ).toStrictEqual([
      "Kids leave home",
      "Kids leave home",
      "Retirement",
      "Retirement",
      "Downsize",
      "Downsize",
    ]);
    expect(within(section).getAllByText("2053")).toHaveLength(2);
    expect(within(section).getAllByText("2053").at(-1)).toHaveClass("figure");
    expect(within(section).getAllByText("Age 61")).toHaveLength(2);
    expect(within(section).getAllByText("Age 61").at(-1)).toHaveClass("label");
    // The ruler marks 2040 with its age too, so the row's is read off
    // the list.
    expect(
      within(within(section).getByRole("list")).getAllByText("Age 48"),
    ).toHaveLength(2);
    expect(within(section).getAllByText("Age 67")).toHaveLength(2);
    expect(
      within(section).getAllByText(
        "Moves with the retirement age on the dashboard",
      ),
    ).toHaveLength(2);
    // Hidden from the tree, so no query is better than the slot.
    expect(
      within(section)
        .getAllByText(bySlot("pin-bar-pin"), { suggest: false })
        .map((pin) => pin.style.left),
    ).toStrictEqual(
      [14, 14, 27, 27, 33, 33].map((years) => `${String((years / 57) * 100)}%`),
    );
  });

  it("lists retirement alone for a household listing no milestone", () => {
    render(<MilestoneList milestones={[]} plan={retiring} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getAllByText("Retirement")).toHaveLength(2);
  });
});
