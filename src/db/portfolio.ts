import { desc, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";

import { queried } from "@/db/queried";
import { portfolioFiles } from "@/db/schema";
import { Stale } from "@/lib/answer";

// A kept version of the household's binary .portfolio file: its exact
// bytes, the sanitized filename it was uploaded under, when it was
// saved, and its version counting up from one.
export interface StoredPortfolio {
  readonly content: Uint8Array<ArrayBuffer>;
  readonly fileName: string;
  readonly savedAt: Date;
  readonly version: number;
}

// Keeps the uploaded .portfolio file as the version after afterVersion
// in one atomic statement. Checking coalesce(max(version), 0) against
// afterVersion inside the INSERT ... SELECT rejects both stale uploads
// (staying sound after older versions are pruned by the retention
// trigger) and forged future versions, while ON CONFLICT DO NOTHING
// serializes concurrent uploads on the primary key. The explicit ::bytea
// cast ensures Postgres assigns OID 17 to the parameter on both PGlite
// and Neon HTTP.
export async function keepPortfolioAfter(
  db: Database,
  afterVersion: number,
  file: {
    readonly content: Uint8Array<ArrayBuffer>;
    readonly fileName: string;
  },
): Promise<{ readonly savedAt: Date; readonly version: number }> {
  const current = db
    .select({
      latest: sql<number>`coalesce(max(${portfolioFiles.version}), 0)`.as(
        "latest",
      ),
    })
    .from(portfolioFiles)
    .as("current");
  const [kept] = await queried(
    db
      .insert(portfolioFiles)
      .select(
        db
          .select({
            content: sql<Uint8Array<ArrayBuffer>>`${file.content}::bytea`.as(
              "content",
            ),
            fileName: sql<string>`${file.fileName}::text`.as("file_name"),
            savedAt: sql<Date>`now()`.as("saved_at"),
            version: sql<number>`${current.latest} + 1`.as("version"),
          })
          .from(current)
          .where(eq(current.latest, afterVersion)),
      )
      .onConflictDoNothing()
      .returning({
        savedAt: portfolioFiles.savedAt,
        version: portfolioFiles.version,
      }),
  );
  if (kept === undefined) {
    throw new Stale(
      "The portfolio file changed while this was being saved, so nothing was",
    );
  }
  return kept;
}

// The latest version of the household's .portfolio file, or null before
// one is uploaded.
export async function readLatestPortfolio(
  db: Database,
): Promise<null | StoredPortfolio> {
  const [row] = await queried(
    db
      .select({
        content: portfolioFiles.content,
        fileName: portfolioFiles.fileName,
        savedAt: portfolioFiles.savedAt,
        version: portfolioFiles.version,
      })
      .from(portfolioFiles)
      .orderBy(desc(portfolioFiles.version))
      .limit(1),
  );
  return row ?? null;
}
