import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("the production build", () => {
  // The shell next build prerenders for the progress screen, which is
  // what a browser with JavaScript off is sent before the store's reads
  // stream in. A signed-in screen reads the store, which this suite's
  // server cannot reach, so the shell is read from the build rather than
  // requested. It holds the phone's tab bar, so the tabs are links that
  // work before the page hydrates, with the screen's own marked as the
  // page, and More is drawn closed, opening before the page hydrates a
  // list of the screens it reaches, as a popover of links.
  it("prerenders the phone's tab bar into a screen's shell, its tab current", async () => {
    const html = await readFile(".next/server/app/progress.html", "utf8");
    const bar =
      /<nav [^>]*aria-label="Tab bar"[^>]*>(?<items>[\s\S]*?)<\/nav>/u.exec(
        html,
      )?.groups?.["items"] ?? "";
    const hrefsIn = (markup: string): (string | undefined)[] =>
      [...markup.matchAll(/<a [^>]*>/gu)].map(
        ([tag]) => / href="(?<href>[^"]*)"/u.exec(tag)?.groups?.["href"],
      );
    const links = [...bar.matchAll(/<a [^>]*>/gu)].map(([tag]) => tag);
    const list =
      /<ul (?<tag>(?:[^>]* )?id="more-screens"[^>]*)>(?<rows>[\s\S]*?)<\/ul>/u.exec(
        bar,
      )?.groups ?? {};

    expect(hrefsIn(bar).slice(0, 4)).toStrictEqual([
      "/",
      "/progress",
      "/close",
      "/cogitator",
    ]);
    expect(
      links.filter((tag) => tag.includes('aria-current="page"')),
    ).toStrictEqual([expect.stringContaining('href="/progress"')]);
    expect(bar).toMatch(/<button [^>]*aria-expanded="false"[^>]*>/u);
    expect(bar).toContain(">More<");
    // React writes the prop's own case, which the HTML parser folds.
    expect(bar).toMatch(/<button [^>]*popovertarget="more-screens"[^>]*>/iu);
    expect(list["tag"]).toMatch(/(?:^| )popover="auto"(?: |$)/u);
    expect(hrefsIn(list["rows"] ?? "")).toStrictEqual([
      "/chance",
      "/accounts",
      "/plan",
      "/assumptions",
    ]);
  });
});
