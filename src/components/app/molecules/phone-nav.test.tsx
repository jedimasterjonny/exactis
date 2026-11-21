import type { JSX } from "react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signOut } from "@/actions/auth";
import { Sidebar, SidebarProvider } from "@/components/kit/sidebar";
import { bySlot, stubViewport } from "@/test/dom";

import { PhoneNav } from "./phone-nav";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: (): string => pathname.current,
}));
vi.mock("@/actions/auth", () => ({ signOut: vi.fn() }));

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
  render(<Frame isDue={isDue} />);
  return screen.getByRole("navigation", { name: "Tab bar" });
}

// The bar in the provider the frame gives it, beside the sidebar it
// opens.
function Frame({ isDue }: { readonly isDue: Promise<boolean> }): JSX.Element {
  return (
    <SidebarProvider>
      <Sidebar>
        <span>Every screen</span>
      </Sidebar>
      <PhoneNav isDue={isDue} />
    </SidebarProvider>
  );
}

// More's list, which a closed popover hides from the tree, names and
// all, so it is found by its label, with no suggestion of a query by
// role, which would say so on the console.
function moreScreens(): HTMLElement {
  return screen.getByLabelText("More screens", { suggest: false });
}

describe("PhoneNav", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the four tabs in navigation order, then More", () => {
    const bar = barOn("/progress", closed);
    const items = within(bar).getAllByRole("listitem");

    expect(items.slice(0, 4).map((item) => item.textContent)).toStrictEqual([
      "Dashboard",
      "Progress",
      "Month end",
      "Cogitator",
    ]);
    expect(items).toHaveLength(5);
    expect(items.at(-1)).toContainElement(
      within(bar).getByRole("button", { name: "More" }),
    );
    expect(
      within(bar)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toStrictEqual(["/", "/progress", "/close", "/cogitator"]);
  });

  // jsdom hides a closed popover, as a browser does, and opens none.
  it("lists the screens More reaches, which More opens before the page hydrates", () => {
    const bar = barOn("/accounts", closed);
    const list = moreScreens();

    expect(bar).toContainElement(list);
    expect(list).toHaveAttribute("id", "more-screens");
    expect(list).toHaveAttribute("popover", "auto");
    expect(within(bar).getByRole("button", { name: "More" })).toHaveAttribute(
      "popovertarget",
      "more-screens",
    );
    expect(list).not.toBeVisible();
    expect(
      within(list)
        .getAllByRole("link", { hidden: true, suggest: false })
        .map((link) => [link.getAttribute("href"), link.textContent]),
    ).toStrictEqual([
      ["/chance", "Chance of successII"],
      ["/accounts", "Accounts & assetsIII"],
      ["/plan", "Income & expensesIV"],
      ["/assumptions", "AssumptionsVI"],
    ]);
    expect(
      within(list).getByRole("link", {
        current: "page",
        hidden: true,
        suggest: false,
      }),
    ).toHaveAttribute("href", "/accounts");
    expect(within(list).getByText("III", { suggest: false })).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  // jsdom draws no pseudo-element and forces no colours, so the classes
  // that do are what is read.
  it("marks the current row of More's list with a rail, and draws its focus where colours are forced", () => {
    barOn("/accounts", closed);

    for (const link of within(moreScreens()).getAllByRole("link", {
      hidden: true,
      suggest: false,
    })) {
      expect(link).toHaveClass(
        "min-h-11",
        "aria-[current=page]:before:bg-brand",
        "forced-colors:aria-[current=page]:before:bg-[CanvasText]",
        "forced-colors:focus-visible:outline-solid",
        "forced-colors:focus-visible:outline-2",
        "forced-colors:focus-visible:-outline-offset-2",
        "forced-colors:focus-visible:outline-[CanvasText]",
      );
    }
  });

  // An open popover sits in the top layer over whatever screen a link in
  // it moves to, until the list is taken away.
  it("draws More's list afresh on a move to another screen", () => {
    stubViewport(390);
    pathname.current = "/accounts";
    const { rerender } = render(<Frame isDue={closed} />);
    const before = moreScreens();
    pathname.current = "/plan";
    rerender(<Frame isDue={closed} />);

    expect(moreScreens()).not.toBe(before);
    expect(before).not.toBeInTheDocument();
  });

  // jsdom hides a closed popover, so the form is found hidden; and
  // draws no rule, so the classes setting the row apart are read.
  it("ends More's list with sign-out, a form posting its action, set apart and as wide as the rows", () => {
    barOn("/progress", closed);
    const list = moreScreens();
    const form = within(list).getByRole("form", {
      hidden: true,
      name: "Sign out",
      suggest: false,
    });
    const button = within(form).getByRole("button", {
      hidden: true,
      name: "Sign out",
      suggest: false,
    });

    expect(
      within(list)
        .getAllByRole("listitem", { hidden: true, suggest: false })
        .at(-1),
    ).toContainElement(form);
    expect(
      within(list)
        .getAllByRole("listitem", { hidden: true, suggest: false })
        .at(-1),
    ).toHaveClass("mt-1", "border-t", "pt-1");
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveClass("min-h-11", "w-full");

    fireEvent.click(button);

    expect(signOut).toHaveBeenCalledOnce();
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

  // jsdom forces no colours, so the classes that do are what is read.
  it("draws the current tab's rule in the text colour under forced colours, as the page or through More", () => {
    const bar = barOn("/progress", closed);

    expect(within(bar).getByRole("link", { current: "page" })).toHaveClass(
      "forced-colors:aria-[current=page]:before:bg-[CanvasText]",
    );
    expect(within(bar).getByRole("button", { name: "More" })).toHaveClass(
      "forced-colors:data-current:before:bg-[CanvasText]",
    );
  });

  // Forced colours take the ring away, so an outline stands in for it,
  // inside the cell as the ring is.
  it("outlines the focused tab or More in the text colour under forced colours", () => {
    const bar = barOn("/", closed);

    for (const cell of [
      ...within(bar).getAllByRole("link"),
      within(bar).getByRole("button", { name: "More" }),
    ]) {
      expect(cell).toHaveClass(
        "forced-colors:focus-visible:outline-solid",
        "forced-colors:focus-visible:outline-2",
        "forced-colors:focus-visible:-outline-offset-2",
        "forced-colors:focus-visible:outline-[CanvasText]",
      );
    }
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

    // Cancelled, so the list it opens before the page hydrates stays
    // shut beneath the sheet.
    expect(fireEvent.click(more)).toBe(false);

    expect(
      within(await screen.findByRole("dialog")).getByText("Every screen"),
    ).toBeInTheDocument();
    expect(more).toHaveAttribute("aria-expanded", "true");
  });

  // Back and forward move the screen under an open sheet, which nothing
  // in the sheet chose; a draw on the same screen leaves it open.
  it("closes the sheet when the screen moves under it, and leaves it open while it does not", async () => {
    stubViewport(390);
    pathname.current = "/";
    const { rerender } = render(<Frame isDue={closed} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));

    expect(
      within(await screen.findByRole("dialog")).getByText("Every screen"),
    ).toBeInTheDocument();

    rerender(<Frame isDue={closed} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    pathname.current = "/progress";
    rerender(<Frame isDue={closed} />);

    await waitFor(() => {
      expect(screen.queryByText("Every screen")).not.toBeInTheDocument();
    });
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
