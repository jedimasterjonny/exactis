import { render, screen } from "@testing-library/react";
import { use } from "react";
import { describe, expect, it, vi } from "vitest";

import { takeConsoleOutput } from "../../../vitest.setup";
import Home from "./page";

// Whether the mocked dashboard is still waiting on the store, and what
// it waits on while it is, which never settles.
const store = vi.hoisted(() => ({
  isAnswering: false,
  pending: new Promise<never>(() => undefined),
}));

// The dashboard reads the store, and is async besides, which a test
// render cannot resolve; the page's business is what it streams in and
// what stands in its place meanwhile, so the mock either renders or
// suspends on what never settles, as the dashboard does until the
// store answers.
vi.mock("./dashboard", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the mock factory's key mirrors the component's name
  Dashboard: (): string =>
    store.isAnswering ? use(store.pending) : "The dashboard",
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the mock factory's key mirrors the component's name
  DashboardPending: (): string => "The pending dashboard",
}));

describe("Home", () => {
  it("streams the dashboard in", () => {
    store.isAnswering = false;

    render(<Home />);

    expect(screen.getByText("The dashboard")).toBeInTheDocument();
    expect(screen.queryByText("The pending dashboard")).not.toBeInTheDocument();
  });

  it("stands the pending dashboard in its place while the store answers", async () => {
    store.isAnswering = true;

    render(<Home />);

    expect(
      await screen.findByText("The pending dashboard"),
    ).toBeInTheDocument();
    expect(screen.queryByText("The dashboard")).not.toBeInTheDocument();
    // Testing Library's render is not awaited, and cannot be here, so
    // React says once, a tick after it, that a component suspended inside
    // it; in the app the stream stands the fallback in without a word.
    expect(takeConsoleOutput().join("\n")).toContain(
      "A component suspended inside an `act` scope",
    );
  });
});
