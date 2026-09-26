import { render, screen } from "@testing-library/react";
import { Landmark } from "lucide-react";
import { describe, expect, it } from "vitest";

import { bySlot } from "@/test/dom";

import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("renders the label, the figure, the delta and the caption", () => {
    render(
      <StatTile
        caption="vs Jul run"
        delta={231906}
        icon={Landmark}
        label="Net worth at 91"
        value="£4,218,760"
      />,
    );

    expect(screen.getByText("Net worth at 91")).toHaveClass("label");
    expect(screen.getByText("£4,218,760")).toHaveClass(
      "figure",
      "text-base",
      "@[7.5rem]:text-xl",
      "@[8.75rem]:text-2xl",
      "@[11rem]:text-3xl",
    );
    expect(screen.getByText("+£231,906")).toHaveClass("text-positive");
    expect(screen.getByText(bySlot("card-content"))).toHaveTextContent(
      "vs Jul run",
    );
  });

  it("passes the delta format through and shows a unit beside the figure", () => {
    render(
      <StatTile
        delta={-1.15}
        deltaFormat="points"
        label="Chance of success"
        unit="%"
        value="95.40"
      />,
    );

    expect(screen.getByText("%")).toHaveClass("figure");
    expect(screen.getByText("−1.15pp")).toHaveClass("text-destructive");
  });

  it("omits the footer when there is neither delta nor caption", () => {
    render(<StatTile label="Net legacy" value="£1,642,315" />);

    expect(screen.getByText("£1,642,315")).toBeInTheDocument();
    expect(screen.queryByText(bySlot("card-content"))).not.toBeInTheDocument();
  });

  it("marks the inverse tone on the card for the stylesheet to scope", () => {
    render(
      <StatTile
        caption="Last working year 60"
        label="Retirement"
        tone="inverse"
        value="61"
      />,
    );

    expect(
      screen.getByText(
        (_content, element) => element?.getAttribute("data-tone") === "inverse",
      ),
    ).toHaveAttribute("data-slot", "card");
  });

  // A screen keeps its two tiles that matter most on a phone and leaves
  // the rest off below the breakpoint the tiles go two across at.
  it("leaves a tile its screen hides on a phone off below the breakpoint, and no other", () => {
    render(
      <>
        <StatTile isHiddenOnPhone label="Net legacy" value="£1,642,315" />
        <StatTile label="Chance of success" value="95.40" />
      </>,
    );

    expect(
      screen.getByText(
        (_content, element) =>
          element?.getAttribute("data-slot") === "card" &&
          element.textContent.startsWith("Net legacy"),
      ),
    ).toHaveClass("max-sm:hidden");
    expect(
      screen.getByText(
        (_content, element) =>
          element?.getAttribute("data-slot") === "card" &&
          element.textContent.startsWith("Chance of success"),
      ),
    ).not.toHaveClass("max-sm:hidden");
  });
});
