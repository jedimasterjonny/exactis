import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubViewport } from "@/test/dom";

import AppLayout from "./layout";

vi.mock("next/navigation", () => ({ usePathname: (): string => "/" }));
vi.mock("@/actions/auth", () => ({ signOut: vi.fn() }));

describe("AppLayout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("frames its children in the sidebar shell", () => {
    stubViewport(1024);
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
