import { render, screen, within } from "@testing-library/react";
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

  // Waiting on a points delta and on the caption it lands on, which it
  // holds unseen and unread beneath the one it shows, on a line of its
  // own beneath the delta's ellipsis, itself seen but not read; and once
  // landed, the caption alone.
  it("holds room for a delta to come and the caption it lands on", () => {
    const ownLine = (_content: string, element: Element | null): boolean =>
      element?.classList.contains("basis-full") === true;
    const { rerender } = render(
      <StatTile
        caption="Drawing 3 of 1,000…"
        delta={null}
        deltaFormat="points"
        holds="Of 1,000 futures, lasting to 91"
        label="Chance of success"
        value="…"
      />,
    );

    const content = screen.getByText(bySlot("card-content"));
    const held = within(content).getByText("Of 1,000 futures, lasting to 91");
    const toCome = within(content).getByText("…");

    expect(toCome).toHaveClass("figure");
    expect(toCome).toHaveAttribute("aria-hidden", "true");
    expect(held).toHaveClass("invisible");
    expect(held).toHaveAttribute("aria-hidden", "true");
    expect(
      within(content).getByText(ownLine, { suggest: false }),
    ).toContainElement(held);
    expect(
      within(content).getByText("Drawing 3 of 1,000…"),
    ).toBeInTheDocument();

    rerender(
      <StatTile
        caption="Of 1,000 futures, lasting to 91"
        holds="Of 1,000 futures, lasting to 91"
        label="Chance of success"
        value="80%"
      />,
    );

    expect(
      within(content).queryByText(ownLine, { suggest: false }),
    ).not.toBeInTheDocument();
    expect(content).toHaveTextContent(/^Of 1,000 futures, lasting to 91$/);
  });

  it("puts an action it is given in its top corner", () => {
    render(
      <StatTile
        action={<button type="button">Draw again</button>}
        label="Chance of success"
        value="80%"
      />,
    );

    expect(
      within(screen.getByText(bySlot("card-action"))).getByRole("button", {
        name: "Draw again",
      }),
    ).toBeInTheDocument();
  });

  it("omits the footer when there is neither delta nor caption", () => {
    render(<StatTile label="Net legacy" value="£1,642,315" />);

    expect(screen.getByText("£1,642,315")).toBeInTheDocument();
    expect(screen.queryByText(bySlot("card-content"))).not.toBeInTheDocument();
  });

  it("renders a bottom footer alongside delta and caption, on its own, and omits it when undefined", () => {
    const { rerender } = render(
      <StatTile
        caption="vs Jul run"
        delta={231906}
        footer={<button type="button">Record trade</button>}
        label="Invested"
        value="£420,000"
      />,
    );

    const [details, footerSlot] = screen.getAllByText(bySlot("card-content"));

    expect(details).toHaveTextContent("vs Jul run");
    expect(details).not.toHaveClass("mt-auto");
    expect(footerSlot).toHaveClass("mt-auto");
    expect(footerSlot).toContainElement(
      screen.getByRole("button", { name: "Record trade" }),
    );

    rerender(
      <StatTile
        footer={<button type="button">Record trade</button>}
        label="Invested"
        value="£420,000"
      />,
    );

    const alone = screen.getByText(bySlot("card-content"));

    expect(alone).toHaveClass("mt-auto");
    expect(alone).toContainElement(
      screen.getByRole("button", { name: "Record trade" }),
    );

    rerender(
      <StatTile caption="vs Jul run" label="Invested" value="£420,000" />,
    );

    expect(screen.getByText(bySlot("card-content"))).not.toHaveClass("mt-auto");
    expect(
      screen.queryByRole("button", { name: "Record trade" }),
    ).not.toBeInTheDocument();
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
