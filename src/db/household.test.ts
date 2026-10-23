// @vitest-environment node
import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
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

import { blank, kept as reference } from "@/data/household.fixture";
import { sam } from "@/data/owners.fixture";
import { currentShape, stamped } from "@/data/shapes";
import { inMemory } from "@/db/memory.fixture";
import { householdVersions } from "@/db/schema";

import {
  dropScenario,
  keepAfter,
  listScenarios,
  readAsOf,
  readFirst,
  readLatest,
} from "./household";

const { close, db, empty, ready } = inMemory();

// How a read of a branch's latest version fails, as the statement it ran.
const readFailed =
  'Failed query: select "household", "version" from "household_versions" where "household_versions"."scenario" = $1 order by "household_versions"."version" desc limit $2';

// The household before anything is saved with a second owner added.
const named = { ...blank, next: 3, owners: [...blank.owners, sam] };

// The reference household on the CMA's rates, and a month on, with fees
// of a quarter of a point.
const derived = { ...reference, rateSet: "cma" } as const;
const later = {
  ...derived,
  deductions: { ...reference.deductions, fees: 0.0025 },
};

describe("household store", () => {
  beforeAll(ready);
  beforeEach(empty);
  afterAll(close);

  it("reads nothing before anything is kept, then the latest version kept", async () => {
    expect(await readLatest(db, "")).toBeNull();

    await keepAfter(db, { scenario: "", version: 0 }, blank);
    await keepAfter(db, { scenario: "", version: 1 }, named);

    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(named),
      version: 2,
    });
  });

  it("stamps every version it keeps with the shape it is kept in", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, blank);

    expect(await readLatest(db, "")).toStrictEqual({
      household: { ...blank, shape: currentShape },
      version: 1,
    });
  });

  it("refuses a save after the version another save has kept, and writes nothing", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, blank);
    await keepAfter(db, { scenario: "", version: 1 }, named);

    await expect(
      keepAfter(db, { scenario: "", version: 1 }, blank),
    ).rejects.toThrow(
      "The household changed while this was being saved, so nothing was",
    );
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(named),
      version: 2,
    });
  });

  // The household kept twice, then a scenario branched from it and
  // saved twice in turn, then the household saved again.
  it("counts a scenario's versions from one on their own, reads its first back, and leaves the household's as they were", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, blank);
    await keepAfter(db, { scenario: "", version: 1 }, named);
    await keepAfter(db, { scenario: "Retire early", version: 0 }, named);
    await keepAfter(db, { scenario: "Retire early", version: 1 }, reference);

    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(named),
      version: 2,
    });
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped(reference),
      version: 2,
    });
    expect(await readFirst(db, "Retire early")).toStrictEqual({
      household: stamped(named),
      version: 1,
    });
    expect(await readFirst(db, "Never kept")).toBeNull();

    await keepAfter(db, { scenario: "", version: 2 }, blank);

    expect(await readLatest(db, "")).toMatchObject({ version: 3 });
    expect(await readLatest(db, "Retire early")).toMatchObject({ version: 2 });
    expect(await readLatest(db, "Never kept")).toBeNull();
  });

  // The household and a scenario each at their first version: a save
  // after it lands on either, and a second save after it is refused on
  // the branch it was made to, as is a second scenario by one name.
  it("refuses a save after the version another save has kept on the same branch alone", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, blank);
    await keepAfter(db, { scenario: "Retire early", version: 0 }, blank);

    await expect(
      keepAfter(db, { scenario: "Retire early", version: 0 }, named),
    ).rejects.toThrow(
      "The household changed while this was being saved, so nothing was",
    );
    await keepAfter(db, { scenario: "Retire early", version: 1 }, named);
    await keepAfter(db, { scenario: "", version: 1 }, reference);
    await expect(
      keepAfter(db, { scenario: "", version: 1 }, named),
    ).rejects.toThrow(
      "The household changed while this was being saved, so nothing was",
    );

    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(reference),
      version: 2,
    });
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped(named),
      version: 2,
    });
  });

  it("lists the scenarios kept by name, once each and in order, and not the household", async () => {
    expect(await listScenarios(db)).toStrictEqual([]);

    await keepAfter(db, { scenario: "", version: 0 }, blank);

    expect(await listScenarios(db)).toStrictEqual([]);

    await keepAfter(db, { scenario: "Retire early", version: 0 }, blank);
    await keepAfter(db, { scenario: "Retire early", version: 1 }, named);
    await keepAfter(db, { scenario: "Move house", version: 0 }, blank);

    expect(await listScenarios(db)).toStrictEqual([
      "Move house",
      "Retire early",
    ]);
  });

  it("drops every version of a scenario and nothing else, and never the household", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, blank);
    await keepAfter(db, { scenario: "Retire early", version: 0 }, blank);
    await keepAfter(db, { scenario: "Retire early", version: 1 }, named);
    await keepAfter(db, { scenario: "Move house", version: 0 }, reference);

    await dropScenario(db, "Retire early");

    expect(await readLatest(db, "Retire early")).toBeNull();
    expect(await listScenarios(db)).toStrictEqual(["Move house"]);
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(blank),
      version: 1,
    });

    await expect(dropScenario(db, "")).rejects.toThrow(
      "The household is never dropped",
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  it("drops a scenario's versions up to the one given, and leaves those after it", async () => {
    await keepAfter(db, { scenario: "Retire early", version: 0 }, blank);
    await keepAfter(db, { scenario: "Retire early", version: 1 }, named);
    await keepAfter(db, { scenario: "Retire early", version: 2 }, reference);

    await dropScenario(db, "Retire early", 2);

    expect(
      await db
        .select({ version: householdVersions.version })
        .from(householdVersions),
    ).toStrictEqual([{ version: 3 }]);
    expect(await listScenarios(db)).toStrictEqual(["Retire early"]);
  });

  // The reference household on the rates typed by hand on the first of
  // September, which holds every source the CMA's are derived from, then
  // on the CMA's rates on the tenth and the twentieth; and a scenario
  // branched on the first, on the CMA's rates from the start.
  it("reads the version the CMA's rates stood at by a moment on the branch, or the first to run on them where none by then did", async () => {
    const day = (date: string): Date => new Date(`${date}T12:00:00Z`);
    await db.insert(householdVersions).values([
      {
        household: reference,
        savedAt: day("2026-09-01"),
        scenario: "",
        version: 1,
      },
      {
        household: derived,
        savedAt: day("2026-09-01"),
        scenario: "Retire early",
        version: 1,
      },
    ]);

    expect(await readAsOf(db, "", day("2026-09-15"))).toBeNull();
    expect(await readAsOf(db, "Retire early", day("2026-09-15"))).toStrictEqual(
      { household: derived, savedAt: day("2026-09-01"), version: 1 },
    );

    await db.insert(householdVersions).values([
      {
        household: derived,
        savedAt: day("2026-09-10"),
        scenario: "",
        version: 2,
      },
      {
        household: later,
        savedAt: day("2026-09-20"),
        scenario: "",
        version: 3,
      },
    ]);

    expect(await readAsOf(db, "", day("2026-09-15"))).toStrictEqual({
      household: derived,
      savedAt: day("2026-09-10"),
      version: 2,
    });
    expect(await readAsOf(db, "", day("2026-09-20"))).toMatchObject({
      version: 3,
    });
    expect(await readAsOf(db, "", day("2026-09-05"))).toMatchObject({
      version: 2,
    });
  });

  // The household on the CMA's rates from the first of September; a
  // scenario made on the tenth on the rates typed, which chose the CMA's
  // on the twentieth; and one made on the twentieth.
  it("reads the household's version for a scenario made after the moment, and a scenario's own once it was there", async () => {
    const day = (date: string): Date => new Date(`${date}T12:00:00Z`);
    await db.insert(householdVersions).values([
      {
        household: derived,
        savedAt: day("2026-09-01"),
        scenario: "",
        version: 1,
      },
      {
        household: reference,
        savedAt: day("2026-09-10"),
        scenario: "Retire early",
        version: 1,
      },
      {
        household: later,
        savedAt: day("2026-09-20"),
        scenario: "Retire early",
        version: 2,
      },
      {
        household: later,
        savedAt: day("2026-09-20"),
        scenario: "Move house",
        version: 1,
      },
    ]);

    expect(await readAsOf(db, "Move house", day("2026-09-15"))).toStrictEqual({
      household: derived,
      savedAt: day("2026-09-01"),
      version: 1,
    });
    expect(await readAsOf(db, "Retire early", day("2026-09-15"))).toStrictEqual(
      { household: later, savedAt: day("2026-09-20"), version: 2 },
    );
  });

  // Postgres refuses a NUL in jsonb, and the values bound to a save are
  // the whole household, which a failure logged would carry.
  it("fails a query with the statement and the driver's code and words, and none of the values bound to it", async () => {
    await expect(
      keepAfter(
        db,
        { scenario: "Retire early", version: 0 },
        { ...named, owners: [...blank.owners, { ...sam, name: "Sam\u0000" }] },
      ),
    ).rejects.toStrictEqual(
      new Error(
        'Failed query: insert into "household_versions" ("household", "saved_at", "scenario", "version") values ($1, default, $2, $3) on conflict do nothing returning "version"',
        {
          cause: {
            code: "22P05",
            message: "unsupported Unicode escape sequence",
          },
        },
      ),
    );
  });

  // Neon's driver reads its URL on the first query, and quotes one it
  // cannot read whole, password and all, as a URL built by hand and
  // mistyped would be.
  it("fails a query without a connection string the driver quotes", async () => {
    const mistyped = drizzle({
      client: neon("postgresql://app:hunter2@ep-example.neon.tech:port/neondb"),
    });

    await expect(readLatest(mistyped, "")).rejects.toStrictEqual(
      new Error(readFailed, {
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

    await expect(readLatest(unreached, "")).rejects.toStrictEqual(
      new Error(readFailed, {
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

    await expect(readLatest(odd, "")).rejects.toStrictEqual(
      new Error("Failed query, in no shape a query's failure takes"),
    );
  });

  it("never writes over a version it has kept, deletes one of the household's, or empties the table", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, blank);
    await keepAfter(db, { scenario: "Retire early", version: 0 }, blank);

    const refused = {
      cause: {
        message:
          "A kept version of the household is never written over or deleted",
      },
    };
    await expect(
      db
        .update(householdVersions)
        .set({ household: named })
        .where(eq(householdVersions.scenario, "Retire early")),
    ).rejects.toMatchObject(refused);
    await expect(
      db.update(householdVersions).set({ household: named }),
    ).rejects.toMatchObject(refused);
    await expect(db.delete(householdVersions)).rejects.toMatchObject(refused);
    await expect(
      db.execute(sql`TRUNCATE ${householdVersions}`),
    ).rejects.toMatchObject(refused);
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(blank),
      version: 1,
    });
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped(blank),
      version: 1,
    });

    await db
      .delete(householdVersions)
      .where(eq(householdVersions.scenario, "Retire early"));

    expect(await readLatest(db, "Retire early")).toBeNull();
  });
});
