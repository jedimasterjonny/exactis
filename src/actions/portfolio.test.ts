// @vitest-environment node
import { strToU8 } from "fflate";
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { today } from "@/data/household.fixture";
import { maxPortfolioBytes, portfolioTooLarge } from "@/data/portfolio";
import { inMemory } from "@/db/memory.fixture";
import { readLatestPortfolio } from "@/db/portfolio";
import { standUp } from "@/db/store.fixture";
import { acceptedOf, refused, saved } from "@/lib/answer";
import { dayOf } from "@/lib/months";
import { readPortfolioSnapshot } from "@/lib/portfolio-file";
import { samplePortfolioFile } from "@/lib/portfolio-file.fixture";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import {
  addPortfolioAccount,
  addPortfolioSecurity,
  addPortfolioTransaction,
  updatePortfolioQuotes,
  uploadPortfolio,
} from "./portfolio";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

standUp(memory, { today });

function uploadForm(
  afterVersion: string,
  bytes: Uint8Array<ArrayBuffer>,
  name = "northstar.portfolio",
): FormData {
  const form = new FormData();
  form.set("afterVersion", afterVersion);
  form.set(
    "file",
    new File([bytes], name, { type: "application/octet-stream" }),
  );
  return form;
}

describe("uploadPortfolio", () => {
  it("stores an initial upload and subsequent replacement with exact bytes", async () => {
    const firstBytes = samplePortfolioFile("GBP");
    const first = await uploadPortfolio(
      uploadForm("0", firstBytes, "northstar.portfolio"),
    );
    const storedFirst = await readLatestPortfolio(db);
    expect(storedFirst?.content).toStrictEqual(firstBytes);
    expect(first).toStrictEqual(
      saved({
        fileName: "northstar.portfolio",
        savedOn: dayOf(storedFirst?.savedAt ?? today),
        version: 1,
      }),
    );

    const secondBytes = samplePortfolioFile("EUR");
    const second = await uploadPortfolio(
      uploadForm("1", secondBytes, "northstar-euro.portfolio"),
    );
    const storedSecond = await readLatestPortfolio(db);
    expect(storedSecond?.content).toStrictEqual(secondBytes);
    expect(second).toStrictEqual(
      saved({
        fileName: "northstar-euro.portfolio",
        savedOn: dayOf(storedSecond?.savedAt ?? today),
        version: 2,
      }),
    );
  });

  it("refuses files larger than 4 MB before reading bytes into memory", async () => {
    const oversized = new File(
      [new Uint8Array(maxPortfolioBytes + 1)],
      "huge.portfolio",
      { type: "application/octet-stream" },
    );
    const arrayBufferSpy = vi.spyOn(oversized, "arrayBuffer");
    const form = new FormData();
    form.set("afterVersion", "0");
    form.set("file", oversized);

    expect(await uploadPortfolio(form)).toStrictEqual(
      refused(portfolioTooLarge),
    );
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(await readLatestPortfolio(db)).toBeNull();
  });

  it("strips path segments and control characters from the filename and refuses blank names", async () => {
    const bytes = samplePortfolioFile();
    const posix = await uploadPortfolio(
      uploadForm("0", bytes, "../nested/northstar\u0000\r\n\u007f.portfolio "),
    );
    expect(posix).toMatchObject({
      kind: "saved",
      value: { fileName: "northstar.portfolio", version: 1 },
    });

    const windows = await uploadPortfolio(
      uploadForm("1", bytes, "C:\\Users\\alex\\northstar-win.portfolio"),
    );
    expect(windows).toMatchObject({
      kind: "saved",
      value: { fileName: "northstar-win.portfolio", version: 2 },
    });

    for (const blankName of [
      "   ",
      "folder/",
      "C:\\folder\\",
      "\u0000\n\t",
      ".",
      "..",
      "folder/..",
      "C:\\dir\\..",
    ]) {
      expect(
        await uploadPortfolio(uploadForm("2", bytes, blankName)),
      ).toStrictEqual(refused("The portfolio file has no name"));
    }
    expect(
      await uploadPortfolio(uploadForm("2", bytes, "a".repeat(256))),
    ).toStrictEqual(
      refused("The portfolio file name is longer than 255 characters"),
    );
    expect(await readLatestPortfolio(db)).toMatchObject({ version: 2 });
  });

  it("refuses XML, encrypted, and corrupt uploads without storing them", async () => {
    expect(
      await uploadPortfolio(
        uploadForm("0", new Uint8Array(strToU8("<client/>")), "xml.portfolio"),
      ),
    ).toStrictEqual(
      refused(
        "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read",
      ),
    );
    expect(
      await uploadPortfolio(
        uploadForm(
          "0",
          new Uint8Array(strToU8("PORTFOLIO-secret")),
          "locked.portfolio",
        ),
      ),
    ).toStrictEqual(
      refused(
        "The file is encrypted, and only a Portfolio Performance file saved in binary without a password can be read",
      ),
    );
    expect(
      await uploadPortfolio(
        uploadForm("0", new Uint8Array([0x01, 0x02, 0x03]), "bad.portfolio"),
      ),
    ).toStrictEqual(
      refused(
        "The file is not a zip, as a Portfolio Performance file saved in binary is",
      ),
    );
    expect(await readLatestPortfolio(db)).toBeNull();
  });

  it("refuses uploads while a scenario is open before buffering bytes", async () => {
    vi.mocked(openedScenario).mockResolvedValue("Retire early");
    const file = new File([samplePortfolioFile()], "northstar.portfolio", {
      type: "application/octet-stream",
    });
    const arrayBufferSpy = vi.spyOn(file, "arrayBuffer");
    const form = new FormData();
    form.set("afterVersion", "0");
    form.set("file", file);

    expect(await uploadPortfolio(form)).toStrictEqual(
      refused("Leave the scenario to upload or replace the portfolio file"),
    );
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(await readLatestPortfolio(db)).toBeNull();
  });

  it("refuses stale uploads and triggers refresh", async () => {
    await uploadPortfolio(uploadForm("0", samplePortfolioFile()));
    vi.mocked(refresh).mockClear();

    expect(
      await uploadPortfolio(uploadForm("0", samplePortfolioFile("USD"))),
    ).toStrictEqual(
      refused(
        "The portfolio file changed while this was being saved, so nothing was",
      ),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("throws loudly on forged or missing FormData fields", async () => {
    const file = new File([samplePortfolioFile()], "northstar.portfolio");

    const missingVersion = new FormData();
    missingVersion.set("file", file);
    await expect(uploadPortfolio(missingVersion)).rejects.toThrow(
      "Invalid afterVersion",
    );

    const fileAsVersion = new FormData();
    fileAsVersion.set("afterVersion", file);
    fileAsVersion.set("file", file);
    await expect(uploadPortfolio(fileAsVersion)).rejects.toThrow(
      "Invalid afterVersion",
    );

    for (const bad of [
      "",
      "-1",
      "00001",
      "1.5",
      "abc",
      "2147483647",
      "2147483648",
      "9007199254740992",
    ]) {
      const form = new FormData();
      form.set("afterVersion", bad);
      form.set("file", file);
      await expect(uploadPortfolio(form)).rejects.toThrow(
        "Invalid afterVersion",
      );
    }

    const missingFile = new FormData();
    missingFile.set("afterVersion", "0");
    await expect(uploadPortfolio(missingFile)).rejects.toThrow(
      "Missing portfolio file",
    );

    const stringFile = new FormData();
    stringFile.set("afterVersion", "0");
    stringFile.set("file", "not-a-file");
    await expect(uploadPortfolio(stringFile)).rejects.toThrow(
      "Missing portfolio file",
    );
  });

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(
      uploadPortfolio(uploadForm("0", samplePortfolioFile())),
    ).rejects.toThrow("redirected");
    expect(await readLatestPortfolio(db)).toBeNull();
  });
});

describe("portfolio write-back actions", () => {
  it("appends accounts, securities with UK-dated quotes, transactions, and batch quotes end to end", async () => {
    await uploadPortfolio(uploadForm("0", samplePortfolioFile()));

    // 1. Add a cash account and a securities account referencing it.
    const cashAdded = await addPortfolioAccount(1, {
      currency: "GBP",
      kind: "cash",
      name: "  Harbour Cash  ",
      note: "Settlement",
    });
    expect(cashAdded).toMatchObject({
      kind: "saved",
      value: { savedOn: expect.any(String) as unknown, version: 2 },
    });
    const cashId = acceptedOf(cashAdded).id;

    const portAdded = await addPortfolioAccount(2, {
      kind: "securities",
      name: "Harbour GIA",
      referenceAccountId: cashId,
    });
    expect(portAdded).toMatchObject({ kind: "saved", value: { version: 3 } });
    const portId = acceptedOf(portAdded).id;

    // 2. Add a GBX security with Asset Allocation category and initial price dated to UK today.
    const secAdded = await addPortfolioSecurity(3, {
      categoryId: "aa-equity",
      currency: "GBX",
      isin: "GB00TEST0009",
      latestPrice: 214.015,
      name: "UK Equity Tracker",
      ticker: "UKET",
    });
    expect(secAdded).toMatchObject({ kind: "saved", value: { version: 4 } });
    const secId = acceptedOf(secAdded).id;
    const afterSec = await readLatestPortfolio(db);
    expect(
      readPortfolioSnapshot(
        afterSec?.content ?? new Uint8Array(),
        "northstar.portfolio",
      ).holdings.find((h) => h.id === secId)?.latestPriceDate,
    ).toBe(dayOf(today));

    // 3. Record a purchase into the new accounts & security.
    const txAdded = await addPortfolioTransaction(4, {
      accountId: cashId,
      amount: 1005,
      currency: "GBP",
      date: "2026-09-15",
      fees: 5,
      portfolioId: portId,
      securityId: secId,
      shares: 10,
      taxes: 0,
      type: "purchase",
    });
    expect(txAdded).toMatchObject({ kind: "saved", value: { version: 5 } });

    // 4. Update quotes in one batch.
    const quotesUpdated = await updatePortfolioQuotes(5, {
      date: "2026-09-25",
      quotes: [
        { price: 130.5, securityId: "sec-world" },
        { price: 225, securityId: secId },
      ],
    });
    expect(quotesUpdated).toMatchObject({
      kind: "saved",
      value: { updatedCount: 2, version: 6 },
    });

    const latest = await readLatestPortfolio(db);
    expect(latest?.version).toBe(6);
    const snapshot = readPortfolioSnapshot(
      latest?.content ?? new Uint8Array(),
      latest?.fileName ?? "northstar.portfolio",
    );
    expect(snapshot.cashAccounts.find((a) => a.id === cashId)?.balance).toBe(
      -1005,
    );
    expect(snapshot.holdings.find((h) => h.id === secId)).toMatchObject({
      category: "Global equity",
      latestPrice: 225,
      latestPriceDate: "2026-09-25",
      shares: 10,
    });
    expect(snapshot.holdings.find((h) => h.id === "sec-world")).toMatchObject({
      latestPrice: 130.5,
      latestPriceDate: "2026-09-25",
    });
  });

  it("refuses scenario locks, stale versions, and domain violations cleanly without corrupting stored state", async () => {
    await uploadPortfolio(uploadForm("0", samplePortfolioFile()));
    vi.mocked(refresh).mockClear();

    // Stale version triggers refresh.
    expect(
      await addPortfolioAccount(2, {
        currency: "GBP",
        kind: "cash",
        name: "Stale Cash",
      }),
    ).toStrictEqual(
      refused(
        "The portfolio file changed while this was being saved, so nothing was",
      ),
    );
    expect(refresh).toHaveBeenCalledOnce();

    // Domain refusals return Refusal without refreshing.
    vi.mocked(refresh).mockClear();
    expect(
      await addPortfolioTransaction(1, {
        accountId: "cash-isa",
        amount: 10,
        currency: "GBP",
        date: "2026-09-25",
        fees: 8,
        portfolioId: "port-isa",
        securityId: "sec-world",
        shares: 1,
        taxes: 3,
        type: "purchase",
      }),
    ).toStrictEqual(
      refused("Fees and taxes cannot exceed the transaction amount"),
    );

    expect(
      await addPortfolioSecurity(1, {
        categoryId: "missing-cat",
        currency: "GBP",
        latestPrice: null,
        name: "Orphan Class",
      }),
    ).toStrictEqual(refused("The selected asset class was not found"));

    expect(
      await updatePortfolioQuotes(1, {
        date: "2026-09-25",
        quotes: [{ price: 100, securityId: "missing-sec" }],
      }),
    ).toStrictEqual(refused("A selected security was not found"));
    expect(refresh).not.toHaveBeenCalled();

    // Open scenario refuses writes.
    vi.mocked(openedScenario).mockResolvedValue("Retire early");
    expect(
      await addPortfolioAccount(1, {
        currency: "GBP",
        kind: "cash",
        name: "Blocked Cash",
      }),
    ).toStrictEqual(refused("Leave the scenario to update the portfolio file"));
  });

  it("refuses user-reachable text length and single-line violations with readable messages", async () => {
    await uploadPortfolio(uploadForm("0", samplePortfolioFile()));

    expect(
      await addPortfolioAccount(1, {
        currency: "GBP",
        kind: "cash",
        name: "a".repeat(201),
      }),
    ).toStrictEqual(refused("Name must be one line of up to 200 characters"));

    expect(
      await addPortfolioAccount(1, {
        currency: "GBP",
        kind: "cash",
        name: `Line 1\n${"a".repeat(205)}`,
      }),
    ).toStrictEqual(refused("Name must be one line of up to 200 characters"));

    expect(
      await addPortfolioSecurity(1, {
        currency: "GBP",
        isin: "GB00\tTEST",
        latestPrice: null,
        name: "Valid Name",
        note: "n".repeat(1001),
        ticker: "T".repeat(33),
      }),
    ).toStrictEqual(
      refused(
        "ISIN must be one line of up to 32 characters; Note must be up to 1,000 characters; Ticker must be one line of up to 32 characters",
      ),
    );

    expect(
      await addPortfolioTransaction(1, {
        accountId: "cash-isa",
        amount: 100,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        note: "n".repeat(1001),
        shares: 0,
        taxes: 0,
        type: "deposit",
      }),
    ).toStrictEqual(refused("Note must be up to 1,000 characters"));
  });

  it("throws loudly on forged afterVersion, schema-invalid payloads, or missing sessions", async () => {
    await uploadPortfolio(uploadForm("0", samplePortfolioFile()));

    await expect(
      addPortfolioAccount(0, {
        currency: "GBP",
        kind: "cash",
        name: "Zero Version",
      }),
    ).rejects.toThrow("Invalid afterVersion");
    await expect(
      addPortfolioSecurity(2_147_483_647, {
        currency: "GBP",
        latestPrice: null,
        name: "Overflow Version",
      }),
    ).rejects.toThrow("Invalid afterVersion");
    await expect(
      addPortfolioTransaction(-1, {
        accountId: "cash-isa",
        amount: 10,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "deposit",
      }),
    ).rejects.toThrow("Invalid afterVersion");
    await expect(
      updatePortfolioQuotes(1.5, {
        date: "2026-09-25",
        quotes: [{ price: 100, securityId: "sec-world" }],
      }),
    ).rejects.toThrow("Invalid afterVersion");

    // Structural forgery, wrong types, blank required fields, and mixed forgery + text limit all reject loudly.
    await expect(
      addPortfolioAccount(1, {
        currency: "GBX",
        kind: "cash",
        name: "a".repeat(201),
      }),
    ).rejects.toThrow();
    await expect(
      addPortfolioAccount(1, { currency: "GBP", kind: "cash", name: "   " }),
    ).rejects.toThrow();
    await expect(
      addPortfolioSecurity(1, {
        currency: "GBP",
        latestPrice: 0,
        name: "Zero Price",
      }),
    ).rejects.toThrow();
    await expect(
      addPortfolioTransaction(1, {
        accountId: "cash-isa",
        amount: 0,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "deposit",
      }),
    ).rejects.toThrow();
    await expect(
      addPortfolioTransaction(1, {
        accountId: "cash-isa",
        amount: 100,
        currency: "GBP",
        date: "2026-02-31",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "deposit",
      }),
    ).rejects.toThrow();
    await expect(
      updatePortfolioQuotes(1, { date: "2026-09-25", quotes: [] }),
    ).rejects.toThrow();

    // Missing session rejects before parsing or touching the store.
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));
    await expect(
      addPortfolioAccount(0, {
        currency: "GBP",
        kind: "cash",
        name: "No Session",
      }),
    ).rejects.toThrow("redirected");
    await expect(
      addPortfolioSecurity(0, {
        currency: "GBP",
        latestPrice: null,
        name: "No Session",
      }),
    ).rejects.toThrow("redirected");
    await expect(
      addPortfolioTransaction(0, {
        accountId: "cash-isa",
        amount: 10,
        currency: "GBP",
        date: "2026-09-25",
        fees: 0,
        shares: 0,
        taxes: 0,
        type: "deposit",
      }),
    ).rejects.toThrow("redirected");
    await expect(
      updatePortfolioQuotes(0, {
        date: "2026-09-25",
        quotes: [{ price: 100, securityId: "sec-world" }],
      }),
    ).rejects.toThrow("redirected");
  });
});
