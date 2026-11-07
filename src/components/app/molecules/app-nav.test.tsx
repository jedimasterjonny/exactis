import type { JSX } from "react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar, SidebarProvider, useSidebar } from "@/components/kit/sidebar";
import { stubViewport } from "@/test/dom";

import { AppNav } from "./app-nav";

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

// A button opening the phone's sheet from outside it.
function Opener(): JSX.Element {
  const { setOpenMobile } = useSidebar();
  return (
    <button
      onClick={() => {
        setOpenMobile(true);
      }}
      type="button"
    >
      Open
    </button>
  );
}

// The navigation in the provider the frame gives it, on the current
// screen given, with last month to be closed or not.
function renderNav(current: string, isDue: Promise<boolean>): void {
  stubViewport(1024);
  pathname.current = current;
  render(
    <SidebarProvider>
      <AppNav isDue={isDue} />
    </SidebarProvider>,
  );
}

describe("AppNav", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("links every screen with its numeral in the Screens navigation and marks the current one", () => {
    renderNav("/progress", closed);

    const nav = within(screen.getByRole("navigation", { name: "Screens" }));
    const dashboard = nav.getByRole("link", { name: "Dashboard" });
    const chance = nav.getByRole("link", { name: "Chance of success" });
    const accounts = nav.getByRole("link", { name: "Accounts & assets" });
    const plan = nav.getByRole("link", { name: "Income & expenses" });
    const progress = nav.getByRole("link", { name: "Progress" });
    const assumptions = nav.getByRole("link", { name: "Assumptions" });

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
    expect(nav.getByRole("link", { current: "page" })).toBe(progress);
    expect(nav.queryByText("Due")).not.toBeInTheDocument();
  });

  // The phone's tab bar holds four screens, so the sheet leaves them out
  // where the bar is shown, and lists the rest in their places.
  it("leaves the tab bar's screens out below the md breakpoint", () => {
    renderNav("/", closed);

    expect(
      within(screen.getByRole("navigation", { name: "Screens" }))
        .getAllByRole("listitem")
        .map((item) => [
          item.textContent,
          item.classList.contains("max-md:hidden"),
        ]),
    ).toStrictEqual([
      ["DashboardI", true],
      ["Chance of successII", false],
      ["Accounts & assetsIII", false],
      ["Income & expensesIV", false],
      ["ProgressV", true],
      ["AssumptionsVI", false],
      ["Month endVII", true],
      ["CogitatorVIII", true],
    ]);
  });

  // The numeral is decorative, so a screen reader hears the label alone.
  it("hides each numeral from a screen reader", () => {
    renderNav("/", closed);

    for (const numeral of ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]) {
      expect(screen.getByText(numeral)).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("badges the month end while last month is still to be closed", () => {
    renderNav("/", due);

    const monthEnd = screen.getByRole("link", { name: /^Month end/ });
    expect(monthEnd).toHaveAttribute("href", "/close");
    expect(within(monthEnd).getByText("Due")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    expect(within(monthEnd).getByText("VII")).toHaveClass("label");
  });

  it("closes the phone's sheet when a screen is chosen in it", async () => {
    stubViewport(390);
    pathname.current = "/";
    render(
      <SidebarProvider>
        <Sidebar>
          <AppNav isDue={closed} />
        </Sidebar>
        <Opener />
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const accounts = within(await screen.findByRole("dialog")).getByRole(
      "link",
      { name: "Accounts & assets" },
    );
    // With no router to take it, the link's click would fall through to
    // a navigation, which jsdom cannot make and says so on the console.
    accounts.addEventListener("click", (event) => {
      event.preventDefault();
    });
    fireEvent.click(accounts);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
