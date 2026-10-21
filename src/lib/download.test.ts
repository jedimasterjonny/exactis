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
  it("hands back the file, asked for fresh, in limited time and following no redirect", async () => {
    const fetch = sourceSends(new Response(new Uint8Array([1, 2, 3])));

    expect(await download(address, "The source", "its file")).toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(fetch).toHaveBeenCalledWith(
      address,
      expect.objectContaining({ cache: "no-store", redirect: "manual" }),
    );
    expect(fetch.mock.lastCall?.[1]).not.toHaveProperty("method");
    expect(fetch.mock.lastCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends a request given as it is, fresh, in limited time and following no redirect, and hands back what the source answers with", async () => {
    const fetch = sourceSends(new Response(new Uint8Array([4, 5])));
    const asked = new Request(address, { body: '{"ask":1}', method: "POST" });

    expect(await download(asked, "The source", "its answer")).toStrictEqual(
      new Uint8Array([4, 5]),
    );
    expect(fetch).toHaveBeenCalledWith(
      asked,
      expect.objectContaining({ cache: "no-store", redirect: "manual" }),
    );
  });

  // A source that would send for ever is read no further than the
  // limit, a megabyte at a time, and let go there.
  it("stops reading a file running past 10 MB, and lets the rest go", async () => {
    const cancel = vi.fn<() => void>();
    sourceSends(
      new Response(
        new ReadableStream({
          cancel,
          pull: (controller): void => {
            controller.enqueue(new Uint8Array(1_000_000));
          },
        }),
      ),
    );

    expect(await download(address, "The source", "its file")).toBe(
      "The source sent more than 10 MB, far past the size of its file",
    );
    expect(cancel).toHaveBeenCalledOnce();

    sourceSends(new Response(new Uint8Array(10_000_000)));

    expect(await download(address, "The source", "its file")).toHaveLength(
      10_000_000,
    );
  });

  it("hands back an empty file for an answer with no body", async () => {
    sourceSends(new Response(null, { status: 204 }));

    expect(await download(address, "The source", "its file")).toStrictEqual(
      new Uint8Array(),
    );
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

    sourceSends(
      new Response(null, {
        headers: { location: "https://elsewhere.example.com/" },
        status: 301,
      }),
    );

    expect(await download(address, "The source", "its file")).toBe(
      "The source answered 301 rather than sending its file",
    );
  });
});
