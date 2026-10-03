import type { ComponentProps } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cma } from "@/data/cma.fixture";
import { curve } from "@/data/inflation.fixture";
import { targets } from "@/data/targets.fixture";

import { SourceDates } from "./source-dates";

// The strip on the fourth of September over the fixtures' sources:
// August's vintage with its data as of the end of June, the first of
// September's curve, the allocation imported on the third, and fees and
// yield set that day; with what is given in their place.
function renderStrip(
  given: Partial<ComponentProps<typeof SourceDates>> = {},
): void {
  render(
    <SourceDates
      cma={{ latest: cma, previous: null }}
      curve={curve}
      deductions={{ dividends: 0.02, fees: 0.002, setOn: "2026-09-04" }}
      targets={targets}
      today="2026-09-04"
      {...given}
    />,
  );
}

// What the strip says of each source, by its name.
function sources(): Record<string, null | string> {
  const values = screen.getAllByRole("definition");
  return Object.fromEntries(
    screen
      .getAllByRole("term")
      .map((term, place) => [
        term.textContent,
        values[place]?.textContent ?? null,
      ]),
  );
}

describe("SourceDates", () => {
  it("says the day each source was brought in on and how old it is", () => {
    renderStrip();

    expect(sources()).toStrictEqual({
      "BlackRock CMA": "Aug 2026, data 30 Jun 2026 · 66 days old",
      "BoE curve": "1 Sep 2026 · 3 days old",
      "Fees and yield": "Set 4 Sep 2026 · today",
      "Target allocation": "Imported 3 Sep 2026 · 1 day old",
    });
  });

  it("says what has not been brought in yet, and fees and yield kept before the day was", () => {
    renderStrip({
      cma: null,
      curve: null,
      deductions: { dividends: 0.02, fees: 0.002 },
      targets: null,
    });

    expect(sources()).toStrictEqual({
      "BlackRock CMA": "Not pulled yet",
      "BoE curve": "Not pulled yet",
      "Fees and yield": "Not dated",
      "Target allocation": "Not imported yet",
    });
  });
});
