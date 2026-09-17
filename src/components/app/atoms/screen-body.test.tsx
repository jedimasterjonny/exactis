import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScreenBody } from "./screen-body";

describe("ScreenBody", () => {
  it("stacks the regions it is given inside the screen's gutter", () => {
    render(
      <ScreenBody>
        <p>A region</p>
      </ScreenBody>,
    );

    // eslint-disable-next-line testing-library/no-node-access -- the body is a layout box with no role or text of its own to query by
    expect(screen.getByRole("paragraph").parentElement).toHaveClass(
      "grid",
      "gap-5",
      "p-8",
    );
  });
});
