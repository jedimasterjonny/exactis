import { fireEvent, render, screen } from "@testing-library/react";
import { Sun } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { LabelledSwitch } from "./labelled-switch";

describe("LabelledSwitch", () => {
  it("names the switch after the state it is in and reports a change", () => {
    const onCheckedChange = vi.fn<(isChecked: boolean) => void>();
    render(
      <LabelledSwitch
        icon={Sun}
        isChecked={false}
        onCheckedChange={onCheckedChange}
      >
        Daylight
      </LabelledSwitch>,
    );

    const control = screen.getByRole("switch", { name: "Daylight" });

    expect(control).not.toBeChecked();
    expect(screen.getByText("Daylight")).toHaveClass("flex-1");

    fireEvent.click(control);

    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(
      true,
      expect.anything(),
    );
  });

  it("holds the switch while what it switches is not there to switch, still named for its state", () => {
    const onCheckedChange = vi.fn<(isChecked: boolean) => void>();
    render(
      <LabelledSwitch
        icon={Sun}
        isChecked={false}
        isDisabled
        onCheckedChange={onCheckedChange}
      >
        Daylight
      </LabelledSwitch>,
    );

    const control = screen.getByRole("switch", { name: "Daylight" });

    expect(control).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(control);

    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("takes the sidebar tone and a class of the caller's", () => {
    render(
      <LabelledSwitch
        className="self-end"
        icon={Sun}
        isChecked
        onCheckedChange={vi.fn<(isChecked: boolean) => void>()}
        tone="sidebar"
      >
        Night watch
      </LabelledSwitch>,
    );

    const control = screen.getByRole("switch", { name: "Night watch" });

    expect(control).toBeChecked();
    expect(control).toHaveClass("data-checked:bg-sidebar-primary");
    // eslint-disable-next-line testing-library/no-node-access -- the label is the switch's parent and has no role or text of its own to query by
    expect(control.closest("label")).toHaveClass(
      "self-end",
      "text-sidebar-foreground/60",
    );
  });

  // jsdom has no pointer to match, so the class that keys on one is read.
  it("stands its row 44px tall on a touch screen", () => {
    render(
      <LabelledSwitch
        icon={Sun}
        isChecked={false}
        onCheckedChange={vi.fn<(isChecked: boolean) => void>()}
      >
        Daylight
      </LabelledSwitch>,
    );

    expect(
      // eslint-disable-next-line testing-library/no-node-access -- the label is the row and has no role of its own to query by
      screen.getByRole("switch", { name: "Daylight" }).closest("label"),
    ).toHaveClass("h-8", "pointer-coarse:min-h-11");
  });

  // jsdom lays nothing out, so the class that takes the reach off is read.
  it("keeps the switch's reach to its row, since a press anywhere on the row turns it", () => {
    const onCheckedChange = vi.fn<(isChecked: boolean) => void>();
    render(
      <LabelledSwitch
        icon={Sun}
        isChecked={false}
        onCheckedChange={onCheckedChange}
      >
        Daylight
      </LabelledSwitch>,
    );

    expect(screen.getByRole("switch", { name: "Daylight" })).toHaveClass(
      "after:hidden",
    );

    fireEvent.click(screen.getByText("Daylight"));

    expect(onCheckedChange).toHaveBeenCalledExactlyOnceWith(
      true,
      expect.anything(),
    );
  });

  // jsdom forces no colours, so the classes that do are what is read.
  it("fills a switch on in the system's highlight under forced colours, and an off one's thumb in the text colour, beside the sidebar's oxide", () => {
    render(
      <LabelledSwitch
        icon={Sun}
        isChecked
        onCheckedChange={vi.fn<(isChecked: boolean) => void>()}
        tone="sidebar"
      >
        Night watch
      </LabelledSwitch>,
    );

    expect(screen.getByRole("switch", { name: "Night watch" })).toHaveClass(
      "forced-colors:data-checked:bg-[Highlight]",
      "forced-colors:*:data-unchecked:bg-[CanvasText]",
      "data-checked:bg-sidebar-primary",
    );
  });
});
