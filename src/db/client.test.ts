// @vitest-environment node
import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { describe, expect, it, vi } from "vitest";

import { getDb } from "./client";

describe("getDb", () => {
  it("opens the store at the configured URL once and hands it back after", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@host.neon.tech/db");

    const db = getDb();

    expect(db).toBeInstanceOf(NeonHttpDatabase);
    expect(getDb()).toBe(db);
  });
});
