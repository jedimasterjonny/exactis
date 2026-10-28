import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubViewport } from "@/test/dom";

import { AppFrame } from "./app-frame";

vi.mock("next/navigation", () => ({ usePathname: (): string => "/" }));

describe("AppFrame", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("frames the screen in the main landmark beside the sidebar it is handed", () => {
    stubViewport(1024);
    render(
      <AppFrame banner={null} sidebar={<span>Sidebar</span>}>
        <p>Screen</p>
      </AppFrame>,
    );

    const main = screen.getByRole("main");

    expect(within(main).getByRole("paragraph")).toHaveTextContent("Screen");
    expect(
      within(main).getByRole("button", { name: "Toggle Sidebar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(within(main).queryByText("Sidebar")).not.toBeInTheDocument();
  });

  it("names the current screen's section in the bar above it on a phone", () => {
    stubViewport(390);
    render(
      <AppFrame banner={null} sidebar={null}>
        <p>Screen</p>
      </AppFrame>,
    );

    const main = screen.getByRole("main");

    expect(
      within(main).getByRole("button", { name: "Toggle Sidebar" }),
    ).toBeInTheDocument();
    expect(within(main).getByText("Sect. I · Dashboard")).toHaveClass("label");
  });

  it("heads the main column with the banner it is handed, above the phone's bar", () => {
    stubViewport(390);
    render(
      <AppFrame banner={<p>Banner</p>} sidebar={null}>
        <p>Screen</p>
      </AppFrame>,
    );

    const main = screen.getByRole("main");

    expect(
      within(main)
        .getAllByText(/^(Banner|Sect\. I · Dashboard|Screen)$/)
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["Banner", "Sect. I · Dashboard", "Screen"]);
  });
});
