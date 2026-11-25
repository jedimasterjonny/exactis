"use server";

import type { ZodError, ZodType } from "zod";

import type {
  NewPortfolioAccount,
  NewPortfolioSecurity,
  NewPortfolioTransaction,
  PortfolioQuoteBatch,
} from "@/data/portfolio";
import type { StoredPortfolio } from "@/db/portfolio";
import type { Answer } from "@/lib/answer";
import type { SavedPortfolio, SavedPortfolioMutation } from "@/store/portfolio";

import {
  afterVersionSchema,
  maxPortfolioBytes,
  newPortfolioAccountSchema,
  newPortfolioSecuritySchema,
  newPortfolioTransactionSchema,
  portfolioQuoteBatchSchema,
  portfolioTooLarge,
} from "@/data/portfolio";
import { refusalOf, refused } from "@/lib/answer";
import { today } from "@/lib/months";
import {
  appendAccount,
  appendSecurity,
  appendTransaction,
  updateQuotes,
} from "@/lib/portfolio-file";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";
import { amendPortfolio, storePortfolio } from "@/store/portfolio";

// Postgres int4 max minus 1 so latest + 1 always fits in portfolio_files.version.
const maxAfterVersion = 2_147_483_646;
const maxFileNameLength = 255;

// Free-text input fields whose length and single-line constraints can
// be hit by a pasted value and should return a calm Refusal rather than
// an uncaught ZodError; structural and forged payloads still throw.
const userTextFields = new Set<unknown>(["isin", "name", "note", "ticker"]);

// Appends a cash or securities account to the household's stored
// .portfolio file and persists the next version.
export async function addPortfolioAccount(
  afterVersion: number,
  input: NewPortfolioAccount,
): Promise<Answer<SavedPortfolioMutation<{ readonly id: string }>>> {
  return runPortfolioMutation(
    { afterVersion, input, schema: newPortfolioAccountSchema },
    (stored, parsed) => {
      const { content, id } = appendAccount(stored.content, parsed);
      return { content, result: { id } };
    },
  );
}

// Appends a catalogued security (with optional initial UK-dated quote
// and Asset Allocation leaf assignment) to the household's stored
// .portfolio file and persists the next version.
export async function addPortfolioSecurity(
  afterVersion: number,
  input: NewPortfolioSecurity,
): Promise<Answer<SavedPortfolioMutation<{ readonly id: string }>>> {
  return runPortfolioMutation(
    { afterVersion, input, schema: newPortfolioSecuritySchema },
    (stored, parsed) => {
      const { content, id } = appendSecurity(stored.content, parsed, {
        today: today(),
      });
      return { content, result: { id } };
    },
  );
}

// Appends a transaction of any of Portfolio Performance's fifteen types
// to the household's stored .portfolio file and persists the next version.
export async function addPortfolioTransaction(
  afterVersion: number,
  input: NewPortfolioTransaction,
): Promise<Answer<SavedPortfolioMutation<{ readonly id: string }>>> {
  return runPortfolioMutation(
    { afterVersion, input, schema: newPortfolioTransactionSchema },
    (stored, parsed) => {
      const { content, id } = appendTransaction(stored.content, parsed);
      return { content, result: { id } };
    },
  );
}

// Records a batch of historical quotes dated to one calendar date
// across one or more catalogued securities in a single new version.
export async function updatePortfolioQuotes(
  afterVersion: number,
  input: PortfolioQuoteBatch,
): Promise<Answer<SavedPortfolioMutation<{ readonly updatedCount: number }>>> {
  return runPortfolioMutation(
    { afterVersion, input, schema: portfolioQuoteBatchSchema },
    (stored, parsed) => {
      const { content, updatedCount } = updateQuotes(stored.content, parsed);
      return { content, result: { updatedCount } };
    },
  );
}

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

function isUserTextIssue(issue: ZodError["issues"][number]): boolean {
  return (
    issue.path.length === 1 &&
    userTextFields.has(issue.path[0]) &&
    (issue.code === "too_big" || issue.code === "invalid_format")
  );
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

function parseMutationVersion(afterVersion: number): number {
  const parsed = afterVersionSchema.safeParse(afterVersion);
  if (!parsed.success) {
    throw new Error("Invalid afterVersion");
  }
  return parsed.data;
}

async function runPortfolioMutation<
  TInput,
  TResult extends Record<string, unknown>,
>(
  {
    afterVersion,
    input,
    schema,
  }: {
    readonly afterVersion: number;
    readonly input: TInput;
    readonly schema: ZodType<TInput>;
  },
  mutate: (
    stored: StoredPortfolio,
    parsed: TInput,
  ) => { readonly content: Uint8Array<ArrayBuffer>; readonly result: TResult },
): Promise<Answer<SavedPortfolioMutation<TResult>>> {
  await requireSession();
  const version = parseMutationVersion(afterVersion);
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    if (parsed.error.issues.every(isUserTextIssue)) {
      return refused(refusalOf(parsed.error).message);
    }
    throw parsed.error;
  }
  return amendPortfolio(version, (stored) => mutate(stored, parsed.data));
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
