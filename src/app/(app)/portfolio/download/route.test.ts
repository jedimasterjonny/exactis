// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { uploadPortfolio } from "@/actions/portfolio";
import { today } from "@/data/household.fixture";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { samplePortfolioFile } from "@/lib/portfolio-file.fixture";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();

standUp(memory, { today });

async function uploadFixture(
  bytes: Uint8Array<ArrayBuffer>,
  fileName: string,
): Promise<void> {
  const form = new FormData();
  form.set("afterVersion", "0");
  form.set(
    "file",
    new File([bytes], fileName, { type: "application/octet-stream" }),
  );
  await uploadPortfolio(form);
}

describe("GET /portfolio/download", () => {
  it("answers 404 with no-store before any portfolio file is stored", async () => {
    const response = await GET();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns exact uploaded bytes with RFC 8187 Content-Disposition and no-store", async () => {
    const uploaded = samplePortfolioFile();
    await uploadFixture(uploaded, "Sam's northstar (v1).portfolio");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''Sam%27s%20northstar%20%28v1%29.portfolio",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toStrictEqual(
      uploaded,
    );
  });

  it("still serves the household file while a scenario is open", async () => {
    const uploaded = samplePortfolioFile();
    await uploadFixture(uploaded, "northstar.portfolio");
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''northstar.portfolio",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toStrictEqual(
      uploaded,
    );
  });

  it("hands nothing out without a session", async () => {
    await uploadFixture(samplePortfolioFile(), "northstar.portfolio");
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(GET()).rejects.toThrow("redirected");
  });
});
