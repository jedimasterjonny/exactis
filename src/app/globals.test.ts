// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The stylesheet without its comments, so a value reads as the browser
// reads it.
const sheet = readFileSync(
  new URL("globals.css", import.meta.url),
  "utf8",
).replaceAll(/\/\*[\s\S]*?\*\//gu, "");

// The custom properties a block declares, by name, from where the given
// opening ends to the first brace closing anything, since neither block
// read here holds a block of its own.
function declared(opening: RegExp): Record<string, string> {
  const body =
    new RegExp(`${opening.source}([^}]*)\\}`, "u").exec(sheet)?.[1] ?? "";
  return Object.fromEntries(
    body
      .split(";")
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration !== "")
      .map((declaration): [string, string] => {
        const colon = declaration.indexOf(":");
        return [
          declaration.slice(0, colon),
          declaration.slice(colon + 1).trim(),
        ];
      }),
  );
}

describe("globals.css", () => {
  // The dark scope's series and tones follow the forced palette's scheme,
  // and a media query cannot select the theme's class, so a dark palette
  // over the light theme is given them a second time. A shade changed in
  // the one and not the other would draw that palette's charts and keys
  // in the old shade.
  it("gives a forced dark palette over the light theme every series and tone at the dark scope's value", () => {
    const dark = declared(
      /\.dark \{[^@]*@media not \(forced-colors: active\), \(prefers-color-scheme: dark\) \{/u,
    );
    const forced = declared(
      /@media \(forced-colors: active\) and \(prefers-color-scheme: dark\) \{\s*:root \{/u,
    );

    expect(Object.keys(dark)).toHaveLength(20);
    expect(forced).toStrictEqual(dark);
  });
});
