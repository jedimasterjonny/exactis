import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Panel } from "./panel";

describe("Panel", () => {
  it("is a region named by its heading, on the muted ground, placed by the caller's class", () => {
    render(
      <Panel aria-labelledby="heading" className="self-start">
        <h3 id="heading">Curve, by maturity</h3>
      </Panel>,
    );

    const panel = screen.getByRole("region", { name: "Curve, by maturity" });

    expect(panel.tagName).toBe("SECTION");
    expect(panel).toHaveClass("grid gap-4 self-start rounded-lg bg-muted p-5", {
      exact: true,
    });
  });

  it("is a box with no region of its own when nothing names it, lighter and tighter when subtle", () => {
    render(
      <Panel variant="subtle">
        <p>A month</p>
      </Panel>,
    );

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-node-access -- the unnamed panel is a layout box with no role or text of its own to query by
    const panel = screen.getByRole("paragraph").parentElement;

    expect(panel?.tagName).toBe("DIV");
    expect(panel).toHaveClass("grid gap-3 rounded-md bg-muted/50 p-3", {
      exact: true,
    });
  });
});
