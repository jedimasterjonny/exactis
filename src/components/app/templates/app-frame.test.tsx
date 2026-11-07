import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubViewport } from "@/test/dom";

import { AppFrame } from "./app-frame";

describe("AppFrame", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("frames the screen in the main landmark beside the sidebar it is handed", () => {
    stubViewport(1024);
    render(
      <AppFrame
        banner={null}
        nav={<nav aria-label="Tab bar" />}
        sidebar={<span>Sidebar</span>}
      >
        <p>Screen</p>
      </AppFrame>,
    );

    const main = screen.getByRole("main");

    expect(within(main).getByRole("paragraph")).toHaveTextContent("Screen");
    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(within(main).queryByText("Sidebar")).not.toBeInTheDocument();
  });

  it("sets the tab bar it is handed after the main column, padded at its foot on a phone to clear the bar", () => {
    stubViewport(390);
    render(
      <AppFrame banner={null} nav={<nav aria-label="Tab bar" />} sidebar={null}>
        <p>Screen</p>
      </AppFrame>,
    );

    const main = screen.getByRole("main");
    const bar = screen.getByRole("navigation", { name: "Tab bar" });

    expect(main).toHaveClass("max-md:pb-(--phone-nav)");
    expect(within(main).queryByRole("navigation")).not.toBeInTheDocument();
    expect(main.compareDocumentPosition(bar)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  // The tab bar's More opens the sheet and the screen's header names its
  // section, so nothing is drawn over the screen on a phone.
  it("draws no bar above the screen on a phone", () => {
    stubViewport(390);
    render(
      <AppFrame banner={null} nav={null} sidebar={null}>
        <p>Screen</p>
      </AppFrame>,
    );

    const main = screen.getByRole("main");

    expect(within(main).queryByRole("button")).not.toBeInTheDocument();
    expect(main).toHaveTextContent(/^Screen$/);
  });

  it("heads the main column with the banner it is handed", () => {
    stubViewport(390);
    render(
      <AppFrame banner={<p>Banner</p>} nav={null} sidebar={null}>
        <p>Screen</p>
      </AppFrame>,
    );

    expect(
      within(screen.getByRole("main"))
        .getAllByRole("paragraph")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Banner", "Screen"]);
  });
});
