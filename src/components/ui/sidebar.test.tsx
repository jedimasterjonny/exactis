import type { JSX } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./sidebar";

function Frame(
  props: Readonly<Omit<Parameters<typeof Sidebar>[0], "children">>,
): JSX.Element {
  return (
    <Sidebar {...props}>
      <SidebarHeader>Exactis</SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive>Dashboard</SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<a aria-label="Progress" href="/progress" />}
            >
              Progress
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>Certitudo in numeris</SidebarFooter>
    </Sidebar>
  );
}

// jsdom has no matchMedia, and the mobile hook reads the viewport width.
function stubViewport(width: number): void {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

describe("Sidebar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "sidebar_state=; path=/; max-age=0";
  });

  it("lays the menu out beside the inset and marks the active item", () => {
    stubViewport(1024);
    render(
      <SidebarProvider>
        <Frame />
        <SidebarInset>Screen</SidebarInset>
      </SidebarProvider>,
    );

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-slot",
      "sidebar-inset",
    );
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute(
      "data-active",
    );
    expect(screen.getByRole("link", { name: "Progress" })).not.toHaveAttribute(
      "data-active",
    );
    expect(screen.getByText("Certitudo in numeris")).toHaveAttribute(
      "data-slot",
      "sidebar-footer",
    );
  });

  it("collapses from its trigger and the keyboard shortcut, remembering the state", () => {
    stubViewport(1024);
    const onClick = vi.fn<() => void>();
    render(
      <SidebarProvider>
        <Frame />
        <SidebarTrigger onClick={onClick} />
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(document.cookie).toContain("sidebar_state=false");

    fireEvent.keyDown(window, { ctrlKey: true, key: "b" });

    expect(document.cookie).toContain("sidebar_state=true");

    fireEvent.keyDown(window, { key: "b", metaKey: true });

    expect(document.cookie).toContain("sidebar_state=false");

    fireEvent.keyDown(window, { key: "b" });

    expect(document.cookie).toContain("sidebar_state=false");
  });

  it("reports a controlled state to its owner instead of keeping it", () => {
    stubViewport(1024);
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(
      <SidebarProvider onOpenChange={onOpenChange} open={false}>
        <Frame variant="inset" />
        <SidebarTrigger />
      </SidebarProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("opens as a sheet on a phone", () => {
    stubViewport(375);
    render(
      <SidebarProvider>
        <Frame />
        <SidebarTrigger />
      </SidebarProvider>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(screen.getByRole("dialog", { name: "Sidebar" })).toHaveTextContent(
      "Dashboard",
    );
  });

  it("can render without collapsing at all", () => {
    stubViewport(1024);
    render(
      <SidebarProvider>
        <Frame collapsible="none" />
      </SidebarProvider>,
    );

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeVisible();
  });

  it("refuses to render a part outside its provider", () => {
    stubViewport(1024);

    expect(() => render(<SidebarTrigger />)).toThrow(
      "useSidebar must be used within a SidebarProvider.",
    );
  });
});
