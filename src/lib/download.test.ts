// @vitest-environment node
import type { Mock } from "vitest";

import { describe, expect, it, vi } from "vitest";

import { download } from "./download";

const address = "https://example.com/latest.zip";

// The source answering the fetch with the response given.
function sourceSends(response: Response): Mock<typeof globalThis.fetch> {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("download", () => {
  it("hands back the file, asked for fresh and in limited time", async () => {
    const fetch = sourceSends(new Response(new Uint8Array([1, 2, 3])));

    expect(await download(address, "The source", "its file")).toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(fetch).toHaveBeenCalledWith(
      address,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetch.mock.lastCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  // A fetch that runs out of time rejects, as one that finds nobody
  // does.
  it("says nothing was sent when the source does not answer in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    );

    expect(await download(address, "The source", "its file")).toBe(
      "The source did not send its file",
    );
  });

  // The body of an answer that is not the file is let go unread, so it
  // does not hold the connection open.
  it("says what the source answered instead of the file", async () => {
    const blocked = new Response("Forbidden", { status: 403 });
    sourceSends(blocked);

    expect(await download(address, "The source", "its file")).toBe(
      "The source answered 403 rather than sending its file",
    );
    expect(blocked.bodyUsed).toBe(true);

    sourceSends(new Response(null, { status: 503 }));

    expect(await download(address, "The source", "its file")).toBe(
      "The source answered 503 rather than sending its file",
    );
  });
});
