// @vitest-environment node
import type { Mock } from "vitest";

import { describe, expect, it, vi } from "vitest";

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

    await expect(pullLifeStrategy()).rejects.toThrow("redirected");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts Vanguard's site the question its own page asks, and hands back what the fund holds", async () => {
    const fetch = vanguardSends(new Response(vanguardAnswer()));

    expect(await pullLifeStrategy()).toStrictEqual(saved(holdings));
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

    expect(await pullLifeStrategy()).toStrictEqual(
      refused(
        "Vanguard answered 403 rather than sending what LifeStrategy 80% Equity holds",
      ),
    );
  });

  it("refuses an answer no holding can be read from, in the reader's words", async () => {
    vanguardSends(new Response("<html>"));

    expect(await pullLifeStrategy()).toStrictEqual(
      refused("Vanguard's answer is not JSON"),
    );
  });
});
