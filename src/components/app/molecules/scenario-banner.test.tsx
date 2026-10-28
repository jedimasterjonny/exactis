import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { leaveScenario } from "@/actions/scenarios";

import { ScenarioBanner } from "./scenario-banner";

vi.mock("@/actions/scenarios", () => ({ leaveScenario: vi.fn() }));

describe("ScenarioBanner", () => {
  it("names the scenario open in the caution tone", () => {
    render(<ScenarioBanner isKept name="Retire early" />);

    const banner = screen.getByRole("note");

    expect(banner).toHaveClass("bg-caution/10", "text-caution");
    expect(within(banner).getByText("Scenario · Retire early")).toHaveClass(
      "label",
    );
  });

  it("names a scenario the store no longer keeps as gone", () => {
    render(<ScenarioBanner isKept={false} name="Retire early" />);

    expect(screen.getByRole("note")).toHaveTextContent(
      "Scenario gone, household shown · Retire early",
    );
  });

  it("offers leaving as a form posting to its action", () => {
    render(<ScenarioBanner isKept name="Retire early" />);

    const form = screen.getByRole("form", { name: "Leave the scenario" });
    const button = within(form).getByRole("button", { name: "Leave" });

    expect(button).toHaveAttribute("type", "submit");

    fireEvent.click(button);

    expect(leaveScenario).toHaveBeenCalledOnce();
  });
});
