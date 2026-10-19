import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getScenario } from "@/store/household";
import { stubViewport } from "@/test/dom";

import AppLayout from "./layout";

vi.mock("next/navigation", () => ({ usePathname: (): string => "/" }));
vi.mock("@/actions/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/actions/household", () => ({ importHousehold: vi.fn() }));
vi.mock("@/actions/scenarios", () => ({ leaveScenario: vi.fn() }));
vi.mock("@/store/household", () => ({ getScenario: vi.fn() }));

// The scenario open as reads already answered: the household, and a
// scenario. Each is marked the way React marks a promise it has seen
// settle, so the layout draws from it at once, as the request's boundary
// does once the read is in, rather than suspending inside a render the
// test cannot await.
const household = Object.assign(Promise.resolve(null), {
  status: "fulfilled",
  value: null,
});
const retiringEarly = Object.assign(Promise.resolve("Retire early"), {
  status: "fulfilled",
  value: "Retire early",
});

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
    vi.mocked(getScenario).mockReturnValue(household);

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
    vi.mocked(getScenario).mockReturnValue(retiringEarly);

    renderLayout();

    expect(
      within(screen.getByRole("main")).getByRole("note"),
    ).toHaveTextContent("Scenario · Retire early");
  });
});
