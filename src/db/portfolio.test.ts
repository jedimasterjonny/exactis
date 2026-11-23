// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as z from "zod";

import { inMemory } from "@/db/memory.fixture";
import { portfolioFiles } from "@/db/schema";
import { Stale } from "@/lib/answer";

import type { StoredPortfolio } from "./portfolio";

import { keepPortfolioAfter, readLatestPortfolio } from "./portfolio";

const { close, db, empty, ready } = inMemory();

const neonCall = z.tuple([z.string(), z.object({ body: z.string() })]);
const neonRequest = z.object({
  params: z.array(z.unknown()),
  query: z.string(),
});

describe("portfolio file store", () => {
  beforeAll(ready);
  beforeEach(empty);
  afterAll(close);

  it("reads nothing before anything is kept, then preserves exact bytes across versions including subarray views", async () => {
    expect(await readLatestPortfolio(db)).toBeNull();

    const firstBytes = new Uint8Array([0x00, 0x50, 0x4b, 0x03, 0x04, 0xff]);
    const first = await keepPortfolioAfter(db, 0, {
      content: firstBytes,
      fileName: "northstar.portfolio",
    });
    expect(first).toStrictEqual({
      savedAt: expect.any(Date) as unknown,
      version: 1,
    });

    const readFirst: null | StoredPortfolio = await readLatestPortfolio(db);
    expect(readFirst).toStrictEqual({
      content: firstBytes,
      fileName: "northstar.portfolio",
      savedAt: first.savedAt,
      version: 1,
    });

    // Slice into a larger ArrayBuffer to prove byteOffset and byteLength
    // are honoured rather than copying the whole backing buffer.
    const backing = new Uint8Array([0xaa, 0xbb, 0x00, 0x7f, 0xff, 0xcc]);
    const subarray = new Uint8Array(backing.buffer, 2, 3);
    const second = await keepPortfolioAfter(db, 1, {
      content: subarray,
      fileName: "northstar-v2.portfolio",
    });
    expect(second).toStrictEqual({
      savedAt: expect.any(Date) as unknown,
      version: 2,
    });

    const readSecond = await readLatestPortfolio(db);
    expect(readSecond).toStrictEqual({
      content: new Uint8Array([0x00, 0x7f, 0xff]),
      fileName: "northstar-v2.portfolio",
      savedAt: second.savedAt,
      version: 2,
    });
  });

  it("refuses stale and forged future versions with Stale, writing nothing", async () => {
    await expect(
      keepPortfolioAfter(db, 3, {
        content: new Uint8Array([1, 2, 3]),
        fileName: "northstar.portfolio",
      }),
    ).rejects.toThrow(Stale);
    expect(await readLatestPortfolio(db)).toBeNull();

    const first = new Uint8Array([0x10, 0x20]);
    const second = new Uint8Array([0x30, 0x40]);
    await keepPortfolioAfter(db, 0, {
      content: first,
      fileName: "northstar.portfolio",
    });
    await keepPortfolioAfter(db, 1, {
      content: second,
      fileName: "northstar-v2.portfolio",
    });

    await expect(
      keepPortfolioAfter(db, 1, {
        content: new Uint8Array([0x99]),
        fileName: "stale.portfolio",
      }),
    ).rejects.toStrictEqual(
      new Stale(
        "The portfolio file changed while this was being saved, so nothing was",
      ),
    );
    await expect(
      keepPortfolioAfter(db, 99, {
        content: new Uint8Array([0x99]),
        fileName: "future.portfolio",
      }),
    ).rejects.toThrow(
      "The portfolio file changed while this was being saved, so nothing was",
    );

    expect(await readLatestPortfolio(db)).toMatchObject({
      content: second,
      fileName: "northstar-v2.portfolio",
      version: 2,
    });
  });

  it("prunes versions outside the 750-version rolling window on insert while protecting kept rows and rejecting stale version 0", async () => {
    const versions = async (): Promise<readonly number[]> =>
      (
        await db
          .select({ version: portfolioFiles.version })
          .from(portfolioFiles)
          .orderBy(asc(portfolioFiles.version))
      ).map(({ version }) => version);

    await db.insert(portfolioFiles).values([
      {
        content: new Uint8Array([0x01]),
        fileName: "northstar-v1.portfolio",
        version: 1,
      },
      {
        content: new Uint8Array([0x02]),
        fileName: "northstar-v2.portfolio",
        version: 2,
      },
      {
        content: new Uint8Array([0x75]),
        fileName: "northstar-v750.portfolio",
        version: 750,
      },
    ]);
    expect(await versions()).toStrictEqual([1, 2, 750]);

    await keepPortfolioAfter(db, 750, {
      content: new Uint8Array([0x76]),
      fileName: "northstar-v751.portfolio",
    });
    expect(await versions()).toStrictEqual([2, 750, 751]);

    await expect(
      keepPortfolioAfter(db, 0, {
        content: new Uint8Array([0x99]),
        fileName: "stale-after-prune.portfolio",
      }),
    ).rejects.toThrow(Stale);
    expect(await versions()).toStrictEqual([2, 750, 751]);

    const refused = {
      cause: {
        message:
          "A kept version of the portfolio file is never written over or deleted",
      },
    };
    await expect(
      db.delete(portfolioFiles).where(eq(portfolioFiles.version, 2)),
    ).rejects.toMatchObject(refused);
    await expect(db.delete(portfolioFiles)).rejects.toMatchObject(refused);
    await expect(
      db
        .update(portfolioFiles)
        .set({ fileName: "other.portfolio" })
        .where(eq(portfolioFiles.version, 2)),
    ).rejects.toMatchObject(refused);
    await expect(
      db.execute(sql`TRUNCATE ${portfolioFiles}`),
    ).rejects.toMatchObject(refused);

    await keepPortfolioAfter(db, 751, {
      content: new Uint8Array([0x77]),
      fileName: "northstar-v752.portfolio",
    });
    expect(await versions()).toStrictEqual([750, 751, 752]);
  });

  it("never writes over, deletes, or truncates a kept portfolio file version", async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0xff]);
    await keepPortfolioAfter(db, 0, {
      content: bytes,
      fileName: "northstar.portfolio",
    });

    const refused = {
      cause: {
        message:
          "A kept version of the portfolio file is never written over or deleted",
      },
    };
    await expect(
      db
        .update(portfolioFiles)
        .set({ fileName: "other.portfolio" })
        .where(eq(portfolioFiles.version, 1)),
    ).rejects.toMatchObject(refused);
    await expect(db.delete(portfolioFiles)).rejects.toMatchObject(refused);
    await expect(
      db.execute(sql`TRUNCATE ${portfolioFiles}`),
    ).rejects.toMatchObject(refused);

    expect(await readLatestPortfolio(db)).toMatchObject({
      content: bytes,
      fileName: "northstar.portfolio",
      version: 1,
    });
  });

  it("round-trips bytea over Neon HTTP hex encoding and OID 17 decoding", async () => {
    const savedIso = "2026-11-23T12:00:00.000Z";
    const backing = new Uint8Array([0xde, 0x00, 0x7f, 0xff, 0xad]);
    const slice = new Uint8Array(backing.buffer, 1, 3);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          command: "INSERT",
          fields: [
            { dataTypeID: 1184, name: "saved_at" },
            { dataTypeID: 23, name: "version" },
          ],
          rowAsArray: true,
          rowCount: 1,
          rows: [[savedIso, "1"]],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          command: "SELECT",
          fields: [
            { dataTypeID: 17, name: "content" },
            { dataTypeID: 25, name: "file_name" },
            { dataTypeID: 1184, name: "saved_at" },
            { dataTypeID: 23, name: "version" },
          ],
          rowAsArray: true,
          rowCount: 1,
          rows: [["\\x007fff", "northstar.portfolio", savedIso, "1"]],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const remote = drizzle({
      client: neon("postgresql://app:hunter2@ep-example.neon.tech/neondb"),
    });

    const kept = await keepPortfolioAfter(remote, 0, {
      content: slice,
      fileName: "northstar.portfolio",
    });
    expect(kept).toStrictEqual({ savedAt: new Date(savedIso), version: 1 });

    const [, writeInit] = neonCall.parse(fetchMock.mock.calls[0]);
    const sent = neonRequest.parse(JSON.parse(writeInit.body));
    expect(sent.params).toStrictEqual([
      "\\x007fff",
      "northstar.portfolio",
      "0",
    ]);

    const read = await readLatestPortfolio(remote);
    expect(read).toStrictEqual({
      content: new Uint8Array([0x00, 0x7f, 0xff]),
      fileName: "northstar.portfolio",
      savedAt: new Date(savedIso),
      version: 1,
    });
    expect(Buffer.isBuffer(read?.content)).toBe(false);
  });

  it("scrubs binary values and parameters when a query fails", async () => {
    await expect(
      keepPortfolioAfter(db, 0, {
        content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        fileName: "bad\u0000.portfolio",
      }),
    ).rejects.toStrictEqual(
      new Error(
        'Failed query: insert into "portfolio_files" ("content", "file_name", "saved_at", "version") select $1::bytea as "content", $2::text as "file_name", now() as "saved_at", "latest" + 1 as "version" from (select coalesce(max("version"), 0) as "latest" from "portfolio_files") "current" where "latest" = $3 on conflict do nothing returning "saved_at", "version"',
        {
          cause: {
            code: "22021",
            message: 'invalid byte sequence for encoding "UTF8": 0x00',
          },
        },
      ),
    );
  });
});
