import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signOut } from "@/actions/auth";
import { SidebarProvider } from "@/components/kit/sidebar";
import { bySlot, stubViewport } from "@/test/dom";

import { AppSidebar } from "./app-sidebar";

vi.mock("next/navigation", () => ({ usePathname: (): string => "/" }));
vi.mock("@/actions/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/actions/household", () => ({ importHousehold: vi.fn() }));

// The sidebar's contents in the provider the frame gives them, last
// month closed, as a read already answered and marked the way React
// marks a promise it has seen settle.
function renderSidebar(): void {
  stubViewport(1024);
  render(
    <SidebarProvider>
      <AppSidebar
        isDue={Object.assign(Promise.resolve(false), {
          status: "fulfilled",
          value: false,
        })}
      />
    </SidebarProvider>,
  );
}

describe("AppSidebar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("holds the wordmark, the nav, the theme toggle and the motto", () => {
    renderSidebar();

    expect(screen.getByText("Exactis")).toHaveClass(
      "font-heading",
      "uppercase",
    );
    expect(screen.getByRole("link", { name: /^Dashboard/ })).toHaveAttribute(
      "data-active",
    );
    expect(
      screen.getByRole("switch", { name: "Daylight" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Certitudo in numeris")).toHaveClass("label");
  });

  it("offers sign-out as a form posting to its action", () => {
    renderSidebar();

    const form = screen.getByRole("form", { name: "Sign out" });
    const button = within(form).getByRole("button", { name: "Sign out" });

    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("data-slot", "sidebar-menu-button");
    expect(button).toHaveClass("label");

    fireEvent.click(button);

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("draws the export menu's button as sign-out is, in place of the link", () => {
    renderSidebar();

    expect(screen.getByRole("button", { name: "Export" })).toHaveClass("label");
    expect(
      screen.queryByRole("link", { name: /Export/ }),
    ).not.toBeInTheDocument();
  });

  it("offers to import a household file beside the export, drawn as sign-out is", () => {
    renderSidebar();

    const button = screen.getByRole("button", { name: "Import file…" });

    expect(button).toHaveAttribute("data-slot", "sidebar-menu-button");
    expect(button).toHaveClass("label");
    expect(screen.getByLabelText("Household file")).toHaveAttribute(
      "type",
      "file",
    );
  });

  // The header's auto margin takes the space left over only once the
  // content stops taking it all, as the registry's flex-1 would.
  it("sets the wordmark and the screens together at the foot of a phone's sheet", () => {
    renderSidebar();

    expect(screen.getByText(bySlot("sidebar-header"))).toHaveClass(
      "max-md:mt-auto",
    );
    expect(screen.getByText(bySlot("sidebar-content"))).toHaveClass(
      "flex-1",
      "max-md:flex-initial",
    );
    expect(screen.getByText(bySlot("sidebar-content"))).not.toHaveClass(
      "max-md:justify-end-safe",
    );
  });

  it("keeps the footer clear of the home indicator", () => {
    renderSidebar();

    expect(screen.getByText(bySlot("sidebar-footer"))).toHaveClass(
      "pb-[calc(--spacing(5)+env(safe-area-inset-bottom))]",
    );
  });
});
