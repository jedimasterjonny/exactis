import type { JSX } from "react";

import { render, screen } from "@testing-library/react";
import { Activity } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { forget, ScreenTitle } from "./screen-title";

// The phone's tab bar as it is marked, a tab and More in it.
function Bar(): JSX.Element {
  return (
    <nav aria-label="Tab bar" data-slot="phone-nav">
      <a href="/progress">Progress</a>
      <button type="button">More</button>
    </nav>
  );
}

// Two routes as Next keeps them, an Activity each, the one moved to shown
// and the one left hidden with its title still in the document.
function Routes({ shown }: { readonly shown: "a" | "b" }): JSX.Element {
  return (
    <>
      <Activity key="a" mode={shown === "a" ? "visible" : "hidden"}>
        <ScreenTitle>Route A</ScreenTitle>
      </Activity>
      <Activity key="b" mode={shown === "b" ? "visible" : "hidden"}>
        <ScreenTitle>Route B</ScreenTitle>
      </Activity>
    </>
  );
}

describe("ScreenTitle", () => {
  // Each case opens on a page of its own, at the root, which jsdom
  // would otherwise carry over from the case before.
  beforeEach(() => {
    forget();
    history.replaceState(null, "", "/");
  });

  it("renders the level-one heading, out of the tab order", () => {
    render(<ScreenTitle>Progress points</ScreenTitle>);

    const title = screen.getByRole("heading", {
      level: 1,
      name: "Progress points",
    });

    expect(title).toHaveClass("heading", "text-3xl");
    expect(title).toHaveAttribute("tabindex", "-1");
  });

  it("leaves the focus alone on the page's first load", () => {
    render(<ScreenTitle>Progress points</ScreenTitle>);

    expect(document.body).toHaveFocus();
  });

  it("takes the focus when its screen is moved to", () => {
    const { rerender } = render(
      <ScreenTitle key="dashboard">Projected to age 91</ScreenTitle>,
    );
    history.pushState(null, "", "/progress");
    rerender(<ScreenTitle key="progress">Progress points</ScreenTitle>);

    expect(
      screen.getByRole("heading", { name: "Progress points" }),
    ).toHaveFocus();
  });

  // A first visit puts the loading screen's title up, which takes the
  // focus, and the page's own replaces it, dropping the focus to the body.
  it("takes the focus back once when the title that had it is replaced", () => {
    const { rerender } = render(
      <ScreenTitle key="dashboard">Projected to age 91</ScreenTitle>,
    );
    history.pushState(null, "", "/progress");
    rerender(<ScreenTitle key="loading">Progress points</ScreenTitle>);
    rerender(<ScreenTitle key="page">Progress points</ScreenTitle>);

    expect(
      screen.getByRole("heading", { name: "Progress points" }),
    ).toHaveFocus();
  });

  it("leaves the focus where the user moved it while the screen loaded", () => {
    const { rerender } = render(
      <ScreenTitle key="dashboard">Projected to age 91</ScreenTitle>,
    );
    history.pushState(null, "", "/progress");
    rerender(
      <>
        <ScreenTitle key="loading">Progress points</ScreenTitle>
        <button type="button">Elsewhere</button>
      </>,
    );
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    rerender(
      <>
        <ScreenTitle key="page">Progress points</ScreenTitle>
        <button type="button">Elsewhere</button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
  });

  // React calls the ref of the route hidden with nothing once the
  // address has moved, and calls it again with its title when shown.
  it("takes the focus on a route shown again, and none from the route hidden", () => {
    history.replaceState(null, "", "/a");
    const { rerender } = render(<Routes shown="a" />);
    history.pushState(null, "", "/b");
    rerender(<Routes shown="b" />);

    expect(screen.getByRole("heading", { name: "Route B" })).toHaveFocus();

    history.pushState(null, "", "/a");
    rerender(<Routes shown="a" />);

    expect(screen.getByRole("heading", { name: "Route A" })).toHaveFocus();
  });

  it("does nothing when its screen draws again where it is", () => {
    const { rerender } = render(<ScreenTitle>Month end</ScreenTitle>);
    history.pushState(null, "", "/close");
    rerender(<ScreenTitle>Month end</ScreenTitle>);

    expect(document.body).toHaveFocus();
  });

  it("leaves the focus alone on a move of the search alone", () => {
    history.replaceState(null, "", "/close?month=2031-04");
    const { rerender } = render(
      <ScreenTitle key="month">Month end</ScreenTitle>,
    );
    history.pushState(null, "", "/close");
    rerender(<ScreenTitle key="drawn">Month end</ScreenTitle>);

    expect(document.body).toHaveFocus();
  });

  // Next scrolls to a fragment's target, whose focus is the reader's.
  it("leaves the focus alone on an address with a fragment", () => {
    const { rerender } = render(
      <ScreenTitle key="dashboard">Projected to age 91</ScreenTitle>,
    );
    history.pushState(null, "", "/plan#expenses");
    rerender(<ScreenTitle key="plan">Income & expenses</ScreenTitle>);

    expect(document.body).toHaveFocus();
  });

  it("leaves the focus on the phone's tab that moved it", () => {
    const { rerender } = render(
      <>
        <ScreenTitle key="dashboard">Projected to age 91</ScreenTitle>
        <Bar />
      </>,
    );
    screen.getByRole("link", { name: "Progress" }).focus();
    history.pushState(null, "", "/progress");
    rerender(
      <>
        <ScreenTitle key="progress">Progress points</ScreenTitle>
        <Bar />
      </>,
    );

    expect(screen.getByRole("link", { name: "Progress" })).toHaveFocus();
  });

  // A choice in the sheet hands the focus back to More as the sheet
  // closes, which is no tab, so the title takes it from there.
  it("takes the focus from More, which opened the sheet that moved it", () => {
    const { rerender } = render(
      <>
        <ScreenTitle key="dashboard">Projected to age 91</ScreenTitle>
        <Bar />
      </>,
    );
    screen.getByRole("button", { name: "More" }).focus();
    history.pushState(null, "", "/accounts");
    rerender(
      <>
        <ScreenTitle key="accounts">Accounts & assets</ScreenTitle>
        <Bar />
      </>,
    );

    expect(
      screen.getByRole("heading", { name: "Accounts & assets" }),
    ).toHaveFocus();
  });
});
