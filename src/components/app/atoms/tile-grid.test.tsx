import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TileGrid } from "./tile-grid";

describe("TileGrid", () => {
  it("lays the tiles it is given out as many across as fit", () => {
    render(
      <TileGrid>
        <p>A tile</p>
      </TileGrid>,
    );

    // eslint-disable-next-line testing-library/no-node-access -- the grid is a layout box with no role or text of its own to query by
    expect(screen.getByRole("paragraph").parentElement).toHaveClass(
      "grid-cols-[repeat(auto-fit,minmax(210px,1fr))]",
    );
  });
});
