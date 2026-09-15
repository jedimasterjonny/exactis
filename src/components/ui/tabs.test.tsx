import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Tabs", () => {
  it("renders the strip under its slots and switches panels on a click", () => {
    render(
      <Tabs data-testid="tabs" defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts">Three accounts</TabsContent>
        <TabsContent value="assets">Two assets</TabsContent>
      </Tabs>,
    );

    const root = screen.getByTestId("tabs");
    const list = screen.getByRole("tablist");
    const accounts = screen.getByRole("tab", { name: "Accounts" });
    const assets = screen.getByRole("tab", { name: "Assets" });

    expect(root).toHaveAttribute("data-slot", "tabs");
    expect(root).toHaveAttribute("data-orientation", "horizontal");
    expect(list).toHaveAttribute("data-slot", "tabs-list");
    expect(list).toHaveAttribute("data-variant", "default");
    expect(accounts).toHaveAttribute("data-slot", "tabs-trigger");
    expect(accounts).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "data-slot",
      "tabs-content",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Three accounts");

    fireEvent.click(assets);

    expect(assets).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Two assets");
  });

  it("takes the line variant and the vertical orientation", () => {
    render(
      <Tabs data-testid="tabs" defaultValue="one" orientation="vertical">
        <TabsList variant="line">
          <TabsTrigger value="one">One</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First</TabsContent>
      </Tabs>,
    );

    const list = screen.getByRole("tablist");

    expect(list).toHaveAttribute("data-variant", "line");
    expect(list).toHaveClass(
      "data-[variant=line]:w-full",
      "data-[variant=line]:border-b",
    );
    expect(screen.getByRole("tab")).toHaveClass("after:bg-brand");
    expect(screen.getByTestId("tabs")).toHaveAttribute(
      "data-orientation",
      "vertical",
    );
  });
});
