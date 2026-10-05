import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScreenLabel } from "./screen-label";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: (): string => pathname.current,
}));

describe("ScreenLabel", () => {
  it("labels the screen at the pathname with its section", () => {
    pathname.current = "/accounts";
    render(<ScreenLabel />);

    expect(screen.getByText("Sect. III · Accounts & assets")).toHaveClass(
      "label",
    );
  });

  it("renders nothing where no built screen is", () => {
    pathname.current = "/nowhere";
    const { container } = render(<ScreenLabel />);

    expect(container).toBeEmptyDOMElement();
  });
});
