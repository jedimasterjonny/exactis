import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders its greeting inside the main landmark", () => {
    render(<Home />);

    expect(screen.getByRole("main")).toHaveTextContent("Hello world!");
  });
});
