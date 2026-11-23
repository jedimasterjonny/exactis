import "server-only";
import { refresh } from "next/cache";
import { cache } from "react";

import type { PortfolioSnapshot } from "@/data/portfolio";
import type { StoredPortfolio } from "@/db/portfolio";
import type { Answer } from "@/lib/answer";

import { maxPortfolioBytes, portfolioTooLarge } from "@/data/portfolio";
import { getDb } from "@/db/client";
import { keepPortfolioAfter, readLatestPortfolio } from "@/db/portfolio";
import { Refusal, refused, saved, Stale } from "@/lib/answer";
import { dayOf } from "@/lib/months";
import { readPortfolioSnapshot } from "@/lib/portfolio-file";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

// The household's stored .portfolio file as a page receives it across
// the RSC boundary: the parsed snapshot (never the raw binary bytes),
// the UK date it was saved on, and its version for optimistic replace.
export interface OwnedPortfolio {
  readonly savedOn: string;
  readonly snapshot: PortfolioSnapshot;
  readonly version: number;
}

// What uploading or replacing the household's .portfolio file answers
// with once stored: the sanitized filename, the UK date saved, and the
// new version number.
export interface SavedPortfolio {
  readonly fileName: string;
  readonly savedOn: string;
  readonly version: number;
}

// Reads the latest stored .portfolio row at most once per RSC request.
// Kept separate from storePortfolio so a server action never reads a
// stale request-cached row across refresh().
const readLatest = cache(async (): Promise<null | StoredPortfolio> =>
  readLatestPortfolio(getDb()),
);

// The household's latest stored .portfolio file parsed on the server,
// or null before one is uploaded. Readable while a scenario is open
// because portfolio_files belongs to the household alone.
export async function getPortfolio(): Promise<null | OwnedPortfolio> {
  await requireSession();
  const row = await readLatest();
  if (row === null) {
    return null;
  }
  const snapshot = readPortfolioSnapshot(row.content, row.fileName);
  return { savedOn: dayOf(row.savedAt), snapshot, version: row.version };
}

// Validates and stores an uploaded binary .portfolio file as the next
// household version after afterVersion. Refused while a scenario is
// open, when the bytes are not a readable binary .portfolio file, or
// when another upload landed first (refreshing the page on Stale so the
// client sees the new version).
export async function storePortfolio(
  afterVersion: number,
  file: {
    readonly content: Uint8Array<ArrayBuffer>;
    readonly fileName: string;
  },
): Promise<Answer<SavedPortfolio>> {
  await requireSession();
  if ((await openedScenario()) !== null) {
    return refused(
      "Leave the scenario to upload or replace the portfolio file",
    );
  }
  if (file.content.byteLength > maxPortfolioBytes) {
    return refused(portfolioTooLarge);
  }
  try {
    readPortfolioSnapshot(file.content, file.fileName);
    const kept = await keepPortfolioAfter(getDb(), afterVersion, file);
    refresh();
    return saved({
      fileName: file.fileName,
      savedOn: dayOf(kept.savedAt),
      version: kept.version,
    });
  } catch (error: unknown) {
    if (error instanceof Refusal) {
      if (error instanceof Stale) {
        refresh();
      }
      return refused(error.message);
    }
    throw error;
  }
}
