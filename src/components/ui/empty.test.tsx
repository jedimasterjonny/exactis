import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";

describe("Empty", () => {
  it("renders each part under its slot", () => {
    render(
      <Empty>
        <EmptyHeader aria-label="Header">
          <EmptyMedia variant="icon">Icon</EmptyMedia>
          <EmptyTitle>Nothing to project yet</EmptyTitle>
          <EmptyDescription>Add an account to see it.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>Call to action</EmptyContent>
      </Empty>,
    );

    expect(screen.getByText("Icon")).toHaveAttribute("data-slot", "empty-icon");
    expect(screen.getByText("Nothing to project yet")).toHaveAttribute(
      "data-slot",
      "empty-title",
    );
    expect(screen.getByText("Add an account to see it.")).toHaveAttribute(
      "data-slot",
      "empty-description",
    );
    expect(screen.getByText("Call to action")).toHaveAttribute(
      "data-slot",
      "empty-content",
    );
    expect(screen.getByLabelText("Header")).toHaveAttribute(
      "data-slot",
      "empty-header",
    );
  });

  it("gives the media a plain frame by default and a filled one as an icon", () => {
    render(<EmptyMedia>Plain</EmptyMedia>);
    render(<EmptyMedia variant="icon">Filled</EmptyMedia>);

    expect(screen.getByText("Plain")).toHaveAttribute(
      "data-variant",
      "default",
    );
    expect(screen.getByText("Filled")).toHaveAttribute("data-variant", "icon");
  });
});
