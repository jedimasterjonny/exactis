import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppLayout from "./layout";

vi.mock("next/navigation", () => ({ usePathname: (): string => "/" }));
vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));

describe("AppLayout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("frames its children in the sidebar shell", () => {
    // jsdom has no matchMedia, and the sidebar's mobile hook reads the
    // viewport.
    vi.stubGlobal("innerWidth", 1024);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(
      <AppLayout params={Promise.resolve({})}>
        <p>Screen</p>
      </AppLayout>,
    );

    expect(
      within(screen.getByRole("main")).getByRole("paragraph"),
    ).toHaveTextContent("Screen");
    expect(
      screen.getByRole("link", { name: /^Dashboard/ }),
    ).toBeInTheDocument();
  });
});
