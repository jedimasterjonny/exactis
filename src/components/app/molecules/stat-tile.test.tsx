import { render, screen } from "@testing-library/react";
import { Landmark } from "lucide-react";
import { describe, expect, it } from "vitest";

import { StatTile } from "./stat-tile";

const bySlot =
  (slot: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.getAttribute("data-slot") === slot;

describe("StatTile", () => {
  it("renders the label, the figure, the delta and the caption", () => {
    render(
      <StatTile
        caption="vs Aug run"
        delta={250418}
        icon={Landmark}
        label="Net worth at 89"
        value="£4,533,429"
      />,
    );

    expect(screen.getByText("Net worth at 89")).toHaveClass("label");
    expect(screen.getByText("£4,533,429")).toHaveClass(
      "figure",
      "text-base",
      "@[7.5rem]:text-xl",
      "@[8.75rem]:text-2xl",
      "@[11rem]:text-3xl",
    );
    expect(screen.getByText("+£250,418")).toHaveClass("text-positive");
    expect(screen.getByText(bySlot("card-content"))).toHaveTextContent(
      "vs Aug run",
    );
  });

  it("passes the delta format through and shows a unit beside the figure", () => {
    render(
      <StatTile
        delta={-0.96}
        deltaFormat="points"
        label="Chance of success"
        unit="%"
        value="96.90"
      />,
    );

    expect(screen.getByText("%")).toHaveClass("figure");
    expect(screen.getByText("−0.96pp")).toHaveClass("text-destructive");
  });

  it("omits the footer when there is neither delta nor caption", () => {
    render(<StatTile label="Net legacy" value="£1,771,204" />);

    expect(screen.getByText("£1,771,204")).toBeInTheDocument();
    expect(screen.queryByText(bySlot("card-content"))).not.toBeInTheDocument();
  });

  it("marks the inverse tone on the card for the stylesheet to scope", () => {
    render(
      <StatTile
        caption="Last working year 58"
        label="Retirement"
        tone="inverse"
        value="59"
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
        <StatTile isHiddenOnPhone label="Net legacy" value="£1,771,204" />
        <StatTile label="Chance of success" value="96.90" />
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
