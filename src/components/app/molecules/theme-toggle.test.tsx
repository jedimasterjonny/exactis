import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { takeConsoleOutput } from "../../../../vitest.setup";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("dark", "light");
    localStorage.removeItem("theme");
  });

  it("switches the document between daylight and night watch", () => {
    // jsdom has no matchMedia, which next-themes watches for the system
    // preference even when that preference is not honoured.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    render(
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
      >
        <ThemeToggle />
      </ThemeProvider>,
    );

    // The provider renders the script that sets the class before first
    // paint. A client render cannot run it and React says so once; in the
    // app the layout renders it on the server.
    expect(takeConsoleOutput().join("\n")).toContain(
      "Encountered a script tag while rendering",
    );

    const control = screen.getByRole("switch", { name: "Daylight" });

    expect(control).not.toBeChecked();
    expect(document.documentElement).not.toHaveClass("dark");

    fireEvent.click(control);

    expect(screen.getByRole("switch", { name: "Night watch" })).toBeChecked();
    expect(document.documentElement).toHaveClass("dark");

    fireEvent.click(screen.getByRole("switch", { name: "Night watch" }));

    expect(screen.getByRole("switch", { name: "Daylight" })).not.toBeChecked();
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("reads as daylight on the server, whatever the client has stored", () => {
    localStorage.setItem("theme", "dark");

    // eslint-disable-next-line testing-library/render-result-naming-convention -- renderToStaticMarkup returns a string, not a Testing Library render result
    const markup = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { attribute: "class", defaultTheme: "light", enableSystem: false },
        createElement(ThemeToggle),
      ),
    );

    expect(markup).toContain("Daylight");
    expect(markup).not.toContain("Night watch");
  });
});
