import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarProvider } from "@/components/kit/sidebar";
import { stubViewport } from "@/test/dom";

import { ExportMenu } from "./export-menu";

// The menu in the sidebar it sits in, which reads the viewport.
function renderMenu(): void {
  stubViewport(1024);
  render(
    <SidebarProvider>
      <ExportMenu />
    </SidebarProvider>,
  );
}

describe("ExportMenu", () => {
  it("offers the export as one button, drawn as sign-out is", () => {
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Export" });

    expect(trigger).toHaveClass("label");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens on the two files the route hands out, each a link to it", async () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    const items = await screen.findAllByRole("menuitem");

    expect(
      items.map((item) => [item.textContent, item.getAttribute("href")]),
    ).toStrictEqual([
      ["JSON file", "/export"],
      ["Balances CSV", "/export?as=csv"],
    ]);
  });
});
