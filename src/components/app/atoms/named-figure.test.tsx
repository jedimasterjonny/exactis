import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NamedFigure } from "./named-figure";

describe("NamedFigure", () => {
  it("defines the figure under its name, the name a label and the figure large", () => {
    render(
      <dl>
        <NamedFigure name="Stocks total">7.95%</NamedFigure>
      </dl>,
    );

    expect(screen.getByRole("term")).toHaveTextContent("Stocks total");
    expect(screen.getByRole("term")).toHaveClass("label");
    expect(screen.getByRole("definition")).toHaveTextContent("7.95%");
    expect(screen.getByRole("definition")).toHaveClass("figure", "text-3xl");
  });
});
