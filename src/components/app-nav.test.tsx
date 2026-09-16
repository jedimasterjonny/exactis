import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";

import { AppNav } from "./app-nav";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: (): string => pathname.current,
}));

// jsdom has no matchMedia, and the sidebar's mobile hook reads the viewport.
function stubViewport(width: number): void {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

describe("AppNav", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("links every screen with its numeral and marks the current one", () => {
    stubViewport(1024);
    pathname.current = "/progress";
    render(
      <SidebarProvider>
        <AppNav />
      </SidebarProvider>,
    );

    const dashboard = screen.getByRole("link", { name: /^Dashboard/ });
    const accounts = screen.getByRole("link", { name: /^Accounts/ });
    const plan = screen.getByRole("link", { name: /^Plan/ });
    const progress = screen.getByRole("link", { name: /^Progress/ });

    expect(dashboard).toHaveAttribute("href", "/");
    expect(dashboard).not.toHaveAttribute("data-active");
    expect(within(dashboard).getByText("I")).toHaveClass("label");
    expect(accounts).toHaveAttribute("href", "/accounts");
    expect(accounts).not.toHaveAttribute("data-active");
    expect(within(accounts).getByText("II")).toHaveClass("label");
    expect(plan).toHaveAttribute("href", "/plan");
    expect(plan).not.toHaveAttribute("data-active");
    expect(within(plan).getByText("III")).toHaveClass("label");
    expect(progress).toHaveAttribute("href", "/progress");
    expect(progress).toHaveAttribute("data-active");
    expect(within(progress).getByText("IV")).toHaveClass("label");
  });
});
