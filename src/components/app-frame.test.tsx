import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppFrame } from "./app-frame";

vi.mock("next/navigation", () => ({ usePathname: (): string => "/" }));

// jsdom has no matchMedia, and the sidebar's mobile hook reads the viewport.
function stubViewport(width: number): void {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

describe("AppFrame", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("frames the screen in the main landmark beside the wordmark, nav and motto", () => {
    stubViewport(1024);
    render(
      <AppFrame>
        <p>Screen</p>
      </AppFrame>,
    );

    const main = screen.getByRole("main");

    expect(within(main).getByRole("paragraph")).toHaveTextContent("Screen");
    expect(
      within(main).getByRole("button", { name: "Toggle Sidebar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Exactis")).toHaveClass(
      "font-heading",
      "uppercase",
    );
    expect(screen.getByRole("link", { name: /^Dashboard/ })).toHaveAttribute(
      "data-active",
    );
    expect(screen.getByText("Certitudo in numeris")).toHaveClass("label");
  });
});
