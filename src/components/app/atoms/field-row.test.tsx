import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FieldRow } from "./field-row";

describe("FieldRow", () => {
  it.each([
    { classes: "grid grid-cols-[1.4fr_1fr] gap-4", layout: "named" },
    { classes: "grid grid-cols-2 gap-4", layout: "pair" },
    { classes: "grid grid-cols-2 items-start gap-4", layout: "pair-top" },
    { classes: "grid grid-cols-3 gap-4", layout: "triple" },
  ] as const)(
    "lays the fields of a $layout row out in its own columns",
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
