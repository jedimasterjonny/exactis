import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("the production build", () => {
  // The shell next build prerenders for the progress screen, which is
  // what a browser with JavaScript off is sent before the store's reads
  // stream in. A signed-in screen reads the store, which this suite's
  // server cannot reach, so the shell is read from the build rather than
  // requested. It holds the phone's tab bar, so the tabs are links that
  // work before the page hydrates, with the screen's own marked as the
  // page, and More is drawn closed.
  it("prerenders the phone's tab bar into a screen's shell, its tab current", async () => {
    const html = await readFile(".next/server/app/progress.html", "utf8");
    const bar =
      /<nav [^>]*aria-label="Tab bar"[^>]*>(?<items>[\s\S]*?)<\/nav>/u.exec(
        html,
      )?.groups?.["items"] ?? "";
    const links = [...bar.matchAll(/<a [^>]*>/gu)].map(([tag]) => tag);

    expect(
      links.map((tag) => / href="(?<href>[^"]*)"/u.exec(tag)?.groups?.["href"]),
    ).toStrictEqual(["/", "/progress", "/close", "/cogitator"]);
    expect(
      links.filter((tag) => tag.includes('aria-current="page"')),
    ).toStrictEqual([expect.stringContaining('href="/progress"')]);
    expect(bar).toMatch(/<button [^>]*aria-expanded="false"[^>]*>/u);
    expect(bar).toContain(">More<");
  });
});
