"use server";

import type { Answer } from "@/lib/answer";
import type { SavedPortfolio } from "@/store/portfolio";

import { maxPortfolioBytes, portfolioTooLarge } from "@/data/portfolio";
import { refused } from "@/lib/answer";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";
import { storePortfolio } from "@/store/portfolio";

// Postgres int4 max minus 1 so latest + 1 always fits in portfolio_files.version.
const maxAfterVersion = 2_147_483_646;
const maxFileNameLength = 255;

// Uploads or replaces the household's binary .portfolio file. Enforces
// the 4 MB ceiling, filename sanity and scenario guard before reading
// file bytes into memory, and fails loudly on malformed or missing
// FormData fields that only a bug or forgery can send.
export async function uploadPortfolio(
  formData: FormData,
): Promise<Answer<SavedPortfolio>> {
  await requireSession();
  const afterVersion = parseAfterVersion(formData.get("afterVersion"));
  const entry = formData.get("file");
  if (!(entry instanceof File)) {
    throw new Error("Missing portfolio file");
  }
  if (entry.size > maxPortfolioBytes) {
    return refused(portfolioTooLarge);
  }
  const fileName = sanitizeFileName(entry.name);
  if (fileName === "" || fileName === "." || fileName === "..") {
    return refused("The portfolio file has no name");
  }
  if (fileName.length > maxFileNameLength) {
    return refused("The portfolio file name is longer than 255 characters");
  }
  if ((await openedScenario()) !== null) {
    return refused(
      "Leave the scenario to upload or replace the portfolio file",
    );
  }
  const content = new Uint8Array(await entry.arrayBuffer());
  return storePortfolio(afterVersion, { content, fileName });
}

function parseAfterVersion(raw: FormDataEntryValue | null): number {
  if (typeof raw !== "string" || !/^(?:0|[1-9]\d*)$/u.test(raw)) {
    throw new Error("Invalid afterVersion");
  }
  const parsed = Number(raw);
  if (parsed > maxAfterVersion) {
    throw new Error("Invalid afterVersion");
  }
  return parsed;
}

// Strips POSIX/Windows directory prefixes and control characters (C0,
// DEL, C1) from an uploaded filename while preserving spaces and
// non-ASCII characters for RFC 8187 downloads.
function sanitizeFileName(raw: string): string {
  const slash = Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\"));
  return raw
    .slice(slash + 1)
    .replaceAll(/\p{Cc}/gu, "")
    .trim();
}
