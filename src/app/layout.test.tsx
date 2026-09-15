import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import RootLayout, { metadata } from "./layout";

// next/font/google's loaders are rewritten by the Next compiler at build time
// and cannot run outside it, so each is stubbed with the shape it returns.
// The stub echoes the variable it is given rather than a fixed string, so
// the assertions below check the names the layout actually passes, which are
// the names globals.css reads.
/* eslint-disable @typescript-eslint/naming-convention -- mock factory keys must mirror the exported names, which are not ours to rename */
vi.mock("next/font/google", () => {
  const font = (options: { variable: string }): { variable: string } => ({
    variable: options.variable,
  });
  return { Geist: font, Geist_Mono: font, Space_Grotesk: font };
});
/* eslint-enable @typescript-eslint/naming-convention -- the exported names end with the factory */

// The frame's navigation reads the pathname, which only the app router
// provides.
vi.mock("next/navigation", () => ({ usePathname: (): string => "/" }));

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
    expect(markup).toContain("--font-geist-mono");
    expect(markup).toContain("--font-geist-sans");
    expect(markup).toContain("--font-space-grotesk");
    expect(markup).toContain("<p>child</p>");
  });
});

describe("metadata", () => {
  it("names the app", () => {
    expect(metadata.title).toBe("exactis");
  });
});
