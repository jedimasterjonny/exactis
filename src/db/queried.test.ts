// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it, vi } from "vitest";

import { queried } from "./queried";

describe("queried", () => {
  it("returns the value a query resolves to", async () => {
    await expect(queried(Promise.resolve("kept"))).resolves.toBe("kept");
  });

  it("keeps the statement and the driver's code and words, and drops bound values", async () => {
    const driverFailure = Object.assign(new Error("Failed query: select $1"), {
      cause: Object.assign(new Error("unsupported Unicode escape sequence"), {
        code: "22P05",
        detail: "sensitive value",
      }),
      params: ["secret"],
      query: "select $1",
    });

    await expect(queried(Promise.reject(driverFailure))).rejects.toStrictEqual(
      new Error("Failed query: select $1", {
        cause: {
          code: "22P05",
          message: "unsupported Unicode escape sequence",
        },
      }),
    );
  });

  // Neon's driver reads its URL on the first query, and quotes one it
  // cannot read whole, password and all, as a URL built by hand and
  // mistyped would be.
  it("fails a query without a connection string the driver quotes", async () => {
    const mistyped = drizzle({
      client: neon("postgresql://app:hunter2@ep-example.neon.tech:port/neondb"),
    });

    await expect(
      queried(mistyped.execute(sql`select 1`)),
    ).rejects.toStrictEqual(
      new Error("Failed query: select 1", {
        cause: {
          code: undefined,
          message:
            "Database connection string provided to neon() is not a valid URL (connection string: [a URL]",
          sourceError: undefined,
        },
      }),
    );
  });

  it("fails a query with the code of the network failure beneath it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new TypeError("fetch failed", {
            cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), {
              code: "ENOTFOUND",
            }),
          }),
        ),
    );
    const unreached = drizzle({
      client: neon("postgresql://app:hunter2@ep-example.neon.tech/neondb"),
    });

    await expect(
      queried(unreached.execute(sql`select 1`)),
    ).rejects.toStrictEqual(
      new Error("Failed query: select 1", {
        cause: {
          code: undefined,
          message: "Error connecting to database: TypeError: fetch failed",
          sourceError: { cause: { code: "ENOTFOUND" } },
        },
      }),
    );
  });

  it("fails a query whose failure is in no shape a query's takes with that alone", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ code: 42, message: "x" }, { status: 400 }),
        ),
    );
    const odd = drizzle({
      client: neon("postgresql://app:hunter2@ep-example.neon.tech/neondb"),
    });

    await expect(queried(odd.execute(sql`select 1`))).rejects.toStrictEqual(
      new Error("Failed query, in no shape a query's failure takes"),
    );
  });
});
