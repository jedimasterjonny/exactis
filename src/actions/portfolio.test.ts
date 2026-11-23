// @vitest-environment node
import { strToU8 } from "fflate";
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { today } from "@/data/household.fixture";
import { maxPortfolioBytes, portfolioTooLarge } from "@/data/portfolio";
import { inMemory } from "@/db/memory.fixture";
import { readLatestPortfolio } from "@/db/portfolio";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { dayOf } from "@/lib/months";
import { samplePortfolioFile } from "@/lib/portfolio-file.fixture";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import { uploadPortfolio } from "./portfolio";

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
