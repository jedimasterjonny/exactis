import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar, SidebarProvider } from "@/components/kit/sidebar";
import { bySlot, stubViewport } from "@/test/dom";

import { PhoneNav } from "./phone-nav";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: (): string => pathname.current,
}));

// Whether last month is still to be closed, as reads already answered,
// each marked the way React marks a promise it has seen settle, so the
// badge draws from it at once rather than suspending.
const closed = Object.assign(Promise.resolve(false), {
  status: "fulfilled",
  value: false,
});
const due = Object.assign(Promise.resolve(true), {
  status: "fulfilled",
  value: true,
});

// The bar drawn at a phone's width in the provider the frame gives it,
// beside the sidebar it opens, on the current screen given, with last
// month to be closed or not.
function barOn(current: string, isDue: Promise<boolean>): HTMLElement {
  stubViewport(390);
  pathname.current = current;
  render(
    <SidebarProvider>
      <Sidebar>
        <span>Every screen</span>
      </Sidebar>
      <PhoneNav isDue={isDue} />
    </SidebarProvider>,
  );
  return screen.getByRole("navigation", { name: "Tab bar" });
}

describe("PhoneNav", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the four tabs in navigation order, then More", () => {
    const bar = barOn("/progress", closed);

    expect(
      within(bar)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toStrictEqual([
      "Dashboard",
      "Progress",
      "Month end",
      "Cogitator",
      "More",
    ]);
    expect(
      within(bar)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toStrictEqual(["/", "/progress", "/close", "/cogitator"]);
    expect(
      within(bar).getByRole("button", { name: "More" }),
    ).toBeInTheDocument();
  });

  it("marks the current screen's tab as the page, and not More", () => {
    const bar = barOn("/progress", closed);

    expect(
      within(bar).getByRole("link", { current: "page" }),
    ).toHaveTextContent("Progress");
    expect(
      within(bar).getByRole("button", { name: "More" }),
    ).not.toHaveAttribute("data-current");
  });

  it("marks More on a screen it reaches, with no tab as the page", () => {
    const bar = barOn("/accounts", closed);

    expect(
      within(bar).queryByRole("link", { current: "page" }),
    ).not.toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "More" })).toHaveAttribute(
      "data-current",
    );
  });

  it("marks nothing where no screen is current", () => {
    const bar = barOn("/compare", closed);

    expect(
      within(bar).queryByRole("link", { current: "page" }),
    ).not.toBeInTheDocument();
    expect(
      within(bar).getByRole("button", { name: "More" }),
    ).not.toHaveAttribute("data-current");
  });

  it("dots the month end's tab while last month is still to be closed, naming it Due", () => {
    const bar = barOn("/", due);

    const monthEnd = within(bar).getByRole("link", { name: /^Month end/ });

    expect(within(monthEnd).getByText("Due")).toHaveClass("sr-only");
    expect(within(monthEnd).getByText(bySlot("due-dot"))).toHaveClass(
      "bg-caution",
    );
  });

  it("leaves the month end's tab plain while last month is closed", () => {
    const bar = barOn("/", closed);

    expect(
      within(within(bar).getByRole("link", { name: "Month end" })).queryByText(
        "Due",
      ),
    ).not.toBeInTheDocument();
  });

  it("opens the sidebar's sheet from More, saying so", async () => {
    const bar = barOn("/", closed);
    // Taken before the press: the sheet is modal, and hides what is
    // outside it, the bar among it, from the tree once it opens.
    const more = within(bar).getByRole("button", { name: "More" });

    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveAttribute("aria-haspopup", "dialog");

    fireEvent.click(more);

    expect(
      within(await screen.findByRole("dialog")).getByText("Every screen"),
    ).toBeInTheDocument();
    expect(more).toHaveAttribute("aria-expanded", "true");
  });

  it("sits fixed along the foot of the screen below the md breakpoint alone", () => {
    const bar = barOn("/", closed);

    expect(bar).toHaveClass("fixed", "bottom-0", "md:hidden");
  });

  it("lifts its tabs above the home indicator", () => {
    const bar = barOn("/", closed);

    expect(bar).toHaveClass(
      "h-(--phone-nav)",
      "pb-[env(safe-area-inset-bottom)]",
    );
  });
});
