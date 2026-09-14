import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import RootLayout, { metadata } from "./layout";

// geist/font/sans calls next/font/local, which is rewritten by the Next
// compiler at build time and throws when imported directly, so the font is
// stubbed with the shape the package exports. Only the variable is asserted
// on, so the stub cannot flatter the component.
vi.mock("geist/font/sans", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- a mock factory key must mirror the exported name, which is not ours to rename
  GeistSans: { variable: "--font-geist-sans" },
}));

describe("RootLayout", () => {
  // Rendered to a string rather than into jsdom: a root layout emits a whole
  // document, and mounting <html> inside a container div is invalid nesting
  // that React would rightly complain about.
  it("renders a document shell around its children", () => {
    // eslint-disable-next-line testing-library/render-result-naming-convention -- renderToStaticMarkup returns a string, not a Testing Library render result
    const markup = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <p>child</p>
      </RootLayout>,
    );

    expect(markup).toContain('lang="en"');
    expect(markup).toContain("--font-geist-sans");
    expect(markup).toContain("<p>child</p>");
  });
});

describe("metadata", () => {
  it("names the app", () => {
    expect(metadata.title).toBe("exactis");
  });
});
