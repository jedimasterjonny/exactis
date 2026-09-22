import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionCard } from "./section-card";

describe("SectionCard", () => {
  it("is a region named by its title, with the label above and the content beneath", () => {
    render(
      <SectionCard className="pb-0" label="Sect. II.i" title="Accounts">
        <p>Rows</p>
      </SectionCard>,
    );

    const region = screen.getByRole("region", { name: "Accounts" });

    expect(region).toHaveClass("pb-0");
    expect(within(region).getByText("Sect. II.i")).toHaveClass("label");
    expect(
      within(region).getByRole("heading", { level: 2, name: "Accounts" }),
    ).toBeInTheDocument();
    expect(within(region).getByRole("paragraph")).toHaveTextContent("Rows");
    expect(within(region).queryByRole("button")).not.toBeInTheDocument();
  });

  it("writes the caption beneath the title when given one", () => {
    render(
      <SectionCard
        caption="Paid in this order."
        label="Sect. II.iii"
        title="Order of payment"
      >
        <p>Chain</p>
      </SectionCard>,
    );

    expect(
      within(
        screen.getByRole("region", { name: "Order of payment" }),
      ).getByText("Paid in this order."),
    ).toHaveClass("text-muted-foreground");
  });

  // Two cards on one screen are two regions, each named by its own
  // title rather than by the other's.
  it("names each card by its own title, and puts its actions in the header", () => {
    render(
      <>
        <SectionCard
          actions={<button type="button">Add account</button>}
          label="Sect. II.i"
          title="Accounts"
        >
          <p>Rows</p>
        </SectionCard>
        <SectionCard label="Sect. II.ii" title="Property and vehicles">
          <p>Assets</p>
        </SectionCard>
      </>,
    );

    expect(
      within(screen.getByRole("region", { name: "Accounts" })).getByRole(
        "button",
        { name: "Add account" },
      ),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Property and vehicles" }),
      ).queryByRole("button"),
    ).not.toBeInTheDocument();
  });
});
