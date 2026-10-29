import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getOpened } from "@/store/household";
import { stubViewport } from "@/test/dom";

import { takeConsoleOutput } from "../../../vitest.setup";
import AppLayout from "./layout";

vi.mock("next/navigation", () => ({ usePathname: (): string => "/" }));
vi.mock("@/actions/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/actions/household", () => ({ importHousehold: vi.fn() }));
vi.mock("@/actions/scenarios", () => ({ leaveScenario: vi.fn() }));
vi.mock("@/store/household", () => ({ getOpened: vi.fn() }));

// The scenario open as reads already answered: the household, and a
// scenario. Each is marked the way React marks a promise it has seen
// settle, so the layout draws from it at once, as the request's boundary
// does once the read is in, rather than suspending inside a render the
// test cannot await.
const household = Object.assign(Promise.resolve(null), {
  status: "fulfilled",
  value: null,
});
const opened = { isKept: true, name: "Retire early" };
const retiringEarly = Object.assign(Promise.resolve(opened), {
  status: "fulfilled",
  value: opened,
});

// A read that failed, marked the way React marks a promise it has seen
// reject, so the layout throws at once. React reads the mark rather than
// waiting on the promise, so its rejection is handled here.
const refusal = new Error("The store did not answer");
const rejected = Promise.reject(refusal);
void rejected.catch(() => undefined);
const failed = Object.assign(rejected, { reason: refusal, status: "rejected" });

// The layout with a screen in it.
function renderLayout(): void {
  stubViewport(1024);
  render(
    <AppLayout params={Promise.resolve({})}>
      <p>Screen</p>
    </AppLayout>,
  );
}

describe("AppLayout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("frames its children in the sidebar shell, with no banner while the household is open", () => {
    vi.mocked(getOpened).mockReturnValue(household);

    renderLayout();

    expect(
      within(screen.getByRole("main")).getByRole("paragraph"),
    ).toHaveTextContent("Screen");
    expect(
      screen.getByRole("link", { name: /^Dashboard/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("heads the main column with the scenario open", () => {
    vi.mocked(getOpened).mockReturnValue(retiringEarly);

    renderLayout();

    expect(
      within(screen.getByRole("main")).getByRole("note"),
    ).toHaveTextContent("Scenario · Retire early");
  });

  it("draws the error screen in the frame, in place of the screen and the banner, when the read of the scenario open fails", () => {
    vi.mocked(getOpened).mockReturnValue(failed);

    renderLayout();

    expect(takeConsoleOutput().join("\n")).toContain(
      "The store did not answer",
    );
    expect(
      screen.getByRole("link", { name: /^Dashboard/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This screen could not be drawn"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Screen")).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
