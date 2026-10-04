import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DialogFrame } from "./dialog-frame";

describe("DialogFrame", () => {
  it("opens on the title under the eyebrow, holding what it is given over the footer", () => {
    render(
      <DialogFrame
        eyebrow="Edit point"
        footer={<button type="button">Done</button>}
        onDismiss={vi.fn<() => void>()}
        title="31 Jul 2026"
      >
        <p>The fields</p>
      </DialogFrame>,
    );

    const dialog = screen.getByRole("dialog", { name: "31 Jul 2026" });

    expect(within(dialog).getByText("Edit point")).toHaveClass("text-brand");
    expect(within(dialog).getByRole("paragraph")).toHaveTextContent(
      "The fields",
    );
    // Held to the screen's height, what it holds scrolls between the
    // title and the footer, which stay put.
    expect(dialog).toHaveClass(
      "max-h-[calc(100dvh-2rem)]",
      "grid-rows-[auto_minmax(0,1fr)_auto]",
    );
    expect(dialog).not.toHaveClass("sm:max-w-lg");
    // eslint-disable-next-line testing-library/no-node-access -- the scrolling box is a layout box with no role or text of its own to query by
    expect(within(dialog).getByRole("paragraph").parentElement).toHaveClass(
      "grid",
      "gap-4",
      "overflow-y-auto",
    );
    // The footer is one row at every width.
    expect(
      // eslint-disable-next-line testing-library/no-node-access -- the footer is a layout box with no role or text of its own to query by
      within(dialog).getByRole("button", { name: "Done" }).parentElement,
    ).toHaveClass("flex-row", "justify-end");
  });

  it("reports its own close as a dismiss", () => {
    const onDismiss = vi.fn<() => void>();
    render(
      <DialogFrame
        eyebrow="Reorder"
        footer={null}
        onDismiss={onDismiss}
        title="Order of payment"
      >
        <p>The rows</p>
      </DialogFrame>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("widens for a form of three columns", () => {
    render(
      <DialogFrame
        eyebrow="New income line"
        footer={null}
        isWide
        onDismiss={vi.fn<() => void>()}
        title="Untitled line"
      >
        <p>The fields</p>
      </DialogFrame>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("sm:max-w-lg");
  });

  it("takes a caller's class over its own width", () => {
    render(
      <DialogFrame
        className="sm:max-w-3xl"
        eyebrow="Month end"
        footer={null}
        isWide
        onDismiss={vi.fn<() => void>()}
        title="Balances for October 2026"
      >
        <p>The balances</p>
      </DialogFrame>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("sm:max-w-3xl");
    expect(screen.getByRole("dialog")).not.toHaveClass("sm:max-w-lg");
  });

  // A field focused unasked on a touch screen opens the keyboard over
  // the form, so there the frame takes the focus itself; a mouse or a
  // keyboard lands in the first field, ready to type. jsdom has no
  // working matchMedia, so it is stubbed to say what the screen is
  // worked by.
  it("takes the focus itself on a touch screen, and gives it to the first field otherwise", async () => {
    const dialog = (
      <DialogFrame
        eyebrow="Edit account"
        footer={null}
        onDismiss={vi.fn<() => void>()}
        title="Stocks & shares ISA"
      >
        <input aria-label="Name" />
      </DialogFrame>
    );
    const view = render(dialog);

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
    });

    view.unmount();
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal("matchMedia", matchMedia);
    render(dialog);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toHaveFocus();
    });
    expect(matchMedia).toHaveBeenCalledWith("(pointer: coarse)");
  });
});
