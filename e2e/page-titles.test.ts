import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("the production build", () => {
  // The shell next build prerenders for the progress screen, read from
  // the build since this suite's server cannot reach the store. Its one
  // title is in the head a browser is sent first, so the screen is named
  // with JavaScript off, and a move to it is announced by that name.
  it("titles a screen's shell by its label, then the app's name", async () => {
    const html = await readFile(".next/server/app/progress.html", "utf8");

    expect(
      [...html.matchAll(/<title>[^<]*<\/title>/gu)].map(([tag]) => tag),
    ).toStrictEqual(["<title>Progress · exactis</title>"]);
  });
});
