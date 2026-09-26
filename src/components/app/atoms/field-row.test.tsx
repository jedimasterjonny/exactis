import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FieldRow } from "./field-row";

describe("FieldRow", () => {
  it.each([
    { classes: "grid gap-4 sm:grid-cols-[1.4fr_1fr]", layout: "named" },
    { classes: "grid gap-4 sm:grid-cols-2", layout: "pair" },
    { classes: "grid items-start gap-4 sm:grid-cols-2", layout: "pair-top" },
    { classes: "grid gap-4 sm:grid-cols-3", layout: "triple" },
  ] as const)(
    "lays the fields of a $layout row out in its own columns, and in one on a phone",
    ({ classes, layout }) => {
      render(
        <FieldRow layout={layout}>
          <p>A field</p>
        </FieldRow>,
      );

      // eslint-disable-next-line testing-library/no-node-access -- a row is a layout box with no role or text of its own to query by
      expect(screen.getByRole("paragraph").parentElement).toHaveClass(classes);
    },
  );
});
