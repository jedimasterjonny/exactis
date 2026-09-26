import { fireEvent, screen, within } from "@testing-library/react";
import { vi } from "vitest";

// What the tests do to the screen and ask of it the same way, which each
// test file kept a copy of until the copies were the same.

// A matcher for an element by the slot it marks itself with, for a part
// that has no role or text of its own to be found by, as a bar's fill,
// an icon or a tile's figure.
export function bySlot(
  slot: string,
): (content: string, element: Element | null) => boolean {
  return (_content, element) => element?.getAttribute("data-slot") === slot;
}

// A figure typed into its field and committed, as the field commits one
// when the focus leaves it.
export function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

// A text or figure field by its label, which Base UI's number field
// draws as a textbox as a name field is, on the screen or within a box
// such as a dialog.
export function field(
  name: string,
  box: HTMLElement = document.body,
): HTMLElement {
  return within(box).getByRole("textbox", { name });
}

// The dialog open on the screen, when only one is.
export function openDialog(): HTMLElement {
  return screen.getByRole("dialog");
}

// A row's line opened in its dialog from the row's pencil, the dialog
// being named by the line's own name.
export function openEditor(name: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
  return screen.getByRole("dialog", { name });
}

// A new record's dialog opened from the button that adds one.
export function openEntry(label: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: label }));
  return screen.getByRole("dialog");
}

// A select by its label: the native select a choice draws, which is a
// combobox to the accessibility tree.
export function select(name: string): HTMLElement {
  return screen.getByRole("combobox", { name });
}

// The slider is the range input inside the group the field's label
// names. It is asked for by the group, since the label's own text is
// what names the group while jsdom's name computation gives the input
// nothing for the same reference, and whether or not it is shown,
// since the thumb is hidden until Base UI has measured a track jsdom
// lays out at no width.
export function slider(name: string): HTMLElement {
  return within(screen.getByRole("group", { name })).getByRole("slider", {
    hidden: true,
  });
}

// jsdom has no matchMedia, and the sidebar's mobile hook reads the
// viewport: a window of the width given, with a matchMedia that
// answers nothing and listens to nothing.
export function stubViewport(width: number): void {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}
