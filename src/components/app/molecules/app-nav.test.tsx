import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/kit/sidebar";
import { stubViewport } from "@/test/dom";

import { AppNav } from "./app-nav";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: (): string => pathname.current,
}));

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
    const chance = screen.getByRole("link", { name: /^Chance of success/ });
    const accounts = screen.getByRole("link", { name: /^Accounts/ });
    const plan = screen.getByRole("link", { name: /^Income & expenses/ });
    const progress = screen.getByRole("link", { name: /^Progress/ });
    const assumptions = screen.getByRole("link", { name: /^Assumptions/ });

    expect(dashboard).toHaveAttribute("href", "/");
    expect(dashboard).not.toHaveAttribute("data-active");
    expect(within(dashboard).getByText("I")).toHaveClass("label");
    expect(chance).toHaveAttribute("href", "/chance");
    expect(chance).not.toHaveAttribute("data-active");
    expect(within(chance).getByText("II")).toHaveClass("label");
    expect(accounts).toHaveAttribute("href", "/accounts");
    expect(accounts).not.toHaveAttribute("data-active");
    expect(within(accounts).getByText("III")).toHaveClass("label");
    expect(plan).toHaveAttribute("href", "/plan");
    expect(plan).not.toHaveAttribute("data-active");
    expect(within(plan).getByText("IV")).toHaveClass("label");
    expect(progress).toHaveAttribute("href", "/progress");
    expect(progress).toHaveAttribute("data-active");
    expect(within(progress).getByText("V")).toHaveClass("label");
    expect(assumptions).toHaveAttribute("href", "/assumptions");
    expect(assumptions).not.toHaveAttribute("data-active");
    expect(within(assumptions).getByText("VI")).toHaveClass("label");
  });
});
