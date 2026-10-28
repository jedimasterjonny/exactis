// @vitest-environment node
import type { Mock } from "vitest";

import { describe, expect, it, vi } from "vitest";

import { range } from "@/data/lifestrategy";
import { holdings, vanguardAnswer } from "@/data/lifestrategy.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { pullLifeStrategy } from "./lifestrategy";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

// Vanguard answering the fetch with the response given.
function vanguardSends(response: Response): Mock<typeof globalThis.fetch> {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("pullLifeStrategy", () => {
  it("sends for nothing without a session", async () => {
    const fetch = vanguardSends(new Response(vanguardAnswer()));
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(pullLifeStrategy("9244")).rejects.toThrow("redirected");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts Vanguard's site the question its own page asks, and hands back what the fund holds", async () => {
    const fetch = vanguardSends(new Response(vanguardAnswer()));

    expect(await pullLifeStrategy("9244")).toStrictEqual(saved(holdings));
    expect(fetch).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ cache: "no-store" }),
    );
    const [asked] = fetch.mock.calls[0] ?? [];
    expect(asked).toMatchObject({
      method: "POST",
      url: "https://www.vanguardinvestor.co.uk/gpx/graphql",
    });
  });

  it("refuses when Vanguard does not answer with the holdings, saying what it answered", async () => {
    vanguardSends(new Response(null, { status: 403 }));

    expect(await pullLifeStrategy("9244")).toStrictEqual(
      refused(
        "Vanguard answered 403 rather than sending what LifeStrategy 80% Equity holds",
      ),
    );
  });

  it("refuses an answer no holding can be read from, in the reader's words", async () => {
    vanguardSends(new Response("<html>"));

    expect(await pullLifeStrategy("9244")).toStrictEqual(
      refused("Vanguard's answer is not JSON"),
    );
  });

  it("asks after the fund of the id given, and hands back what that fund holds", async () => {
    const fetch = vanguardSends(new Response(vanguardAnswer()));

    expect(await pullLifeStrategy("9232")).toStrictEqual(
      saved({ ...holdings, fund: range[1] }),
    );
    const [asked] = fetch.mock.calls[0] ?? [];
    const body: unknown =
      asked instanceof Request ? JSON.parse(await asked.text()) : null;
    expect(body).toHaveProperty("variables", { portIds: ["9232"] });
  });

  it("refuses an id no fund of the range goes by, and asks Vanguard nothing", async () => {
    const fetch = vanguardSends(new Response(vanguardAnswer()));

    expect(await pullLifeStrategy("1234")).toStrictEqual(
      refused("No LifeStrategy fund goes by that id"),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
