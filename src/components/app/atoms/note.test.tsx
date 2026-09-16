import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Note } from "./note";

describe("Note", () => {
  it("renders the sentence as a muted paragraph", () => {
    render(<Note>Allocation is set once at plan level.</Note>);

    const note = screen.getByRole("paragraph");

    expect(note).toHaveTextContent("Allocation is set once at plan level.");
    expect(note).toHaveClass("text-muted-foreground");
  });
});
