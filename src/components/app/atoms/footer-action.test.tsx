import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SidebarProvider } from "@/components/kit/sidebar";
import { stubViewport } from "@/test/dom";

import { FooterAction } from "./footer-action";

describe("FooterAction", () => {
  it("draws the menu button small, in the footer's face, passing the rest through", () => {
    stubViewport(1024);
    render(
      <SidebarProvider>
        <FooterAction type="submit">Sign out</FooterAction>
      </SidebarProvider>,
    );

    const action = screen.getByRole("button", { name: "Sign out" });

    expect(action).toHaveAttribute("data-slot", "sidebar-menu-button");
    expect(action).toHaveAttribute("type", "submit");
    expect(action).toHaveClass(
      "label",
      "text-sidebar-foreground/60",
      "text-xs",
    );
    expect(action).not.toHaveClass("text-sm");
  });
});
