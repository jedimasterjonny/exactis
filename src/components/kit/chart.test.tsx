import { fireEvent, render, screen } from "@testing-library/react";
import { Line, LineChart, XAxis } from "recharts";
import { describe, expect, it } from "vitest";

import { ChartContainer, ChartTooltip } from "./chart";

// Rests the pointer on the middle of the chart, and hands back its
// surface, which is what takes focus.
function hover(): HTMLElement {
  const surface = screen.getByRole("application");
  fireEvent.mouseMove(surface, { clientX: 160, clientY: 100 });
  return surface;
}

// A chart with a tooltip that says when it is open, and a button and a
// focusable drawing outside it to land on.
function renderChart(): void {
  render(
    <>
      <button type="button">Elsewhere</button>
      <svg aria-label="Drawing" role="img" tabIndex={-1} />
      <ChartContainer config={{}}>
        <LineChart
          data={[
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ]}
        >
          <XAxis dataKey="x" />
          <Line dataKey="y" />
          <ChartTooltip
            content={(props) => (props.active ? <span>Open</span> : null)}
          />
        </LineChart>
      </ChartContainer>
    </>,
  );
}

describe("ChartContainer", () => {
  it("closes a tooltip held open by the pointer when a finger lands outside the chart", async () => {
    renderChart();
    hover();

    expect(await screen.findByText("Open")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }), {
      pointerType: "touch",
    });

    expect(screen.queryByText("Open")).not.toBeInTheDocument();
  });

  it("closes a tooltip held open by focus when a finger lands outside the chart, and takes the focus away", async () => {
    renderChart();
    const surface = screen.getByRole("application");
    surface.focus();

    expect(await screen.findByText("Open")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }), {
      pointerType: "touch",
    });

    expect(screen.queryByText("Open")).not.toBeInTheDocument();
    expect(surface).not.toHaveFocus();
  });

  it("leaves focus held outside the chart where it is", () => {
    renderChart();
    const drawing = screen.getByRole("img", { name: "Drawing" });
    drawing.focus();

    fireEvent.pointerDown(drawing, { pointerType: "touch" });

    expect(drawing).toHaveFocus();
  });

  it("keeps the tooltip open when the finger lands on the chart", async () => {
    renderChart();
    const surface = hover();

    expect(await screen.findByText("Open")).toBeInTheDocument();

    fireEvent.pointerDown(surface, { pointerType: "touch" });

    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  // A mouse leaves the chart before it can press outside it, and
  // recharts closes the tooltip on that by itself.
  it("leaves a mouse pressed outside to recharts", async () => {
    renderChart();
    hover();

    expect(await screen.findByText("Open")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }), {
      pointerType: "mouse",
    });

    expect(screen.getByText("Open")).toBeInTheDocument();
  });
});
