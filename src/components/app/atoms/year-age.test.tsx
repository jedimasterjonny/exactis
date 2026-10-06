import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { YearAge } from "./year-age";

describe("YearAge", () => {
  it("sets the year in figures over the age reached in it, muted", () => {
    render(<YearAge age="Age 52" className="folded:hidden" year={2041} />);

    const year = screen.getByText("2041");

    expect(year).toHaveClass("figure");
    expect(screen.getByText("Age 52")).toHaveClass(
      "label",
      "text-muted-foreground",
    );
    // eslint-disable-next-line testing-library/no-node-access -- the pair is a layout box with no role or text of its own to query by
    expect(year.parentElement).toHaveClass("text-right", "folded:hidden");
  });
});
