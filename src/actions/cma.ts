"use server";

import type { Cma, Vintages } from "@/data/cma";
import type { Answer } from "@/lib/answer";

import { vintageName } from "@/data/cma";
import { Refusal, refused } from "@/lib/answer";
import { readCma } from "@/lib/cma-workbook";
import { monthsBetween } from "@/lib/months";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// Where BlackRock publishes its capital market assumptions, as one
// workbook, replaced with each vintage.
const latest =
  "https://www.blackrock.com/blk-inst-c-assets/images/tools/blackrock-investment-institute/cma/blackrock-capital-market-assumptions.xlsx";

// How long BlackRock has to send the workbook, which is some 350KB and
// arrives in a second or two.
const patience = 30_000;

// Pulls BlackRock's latest capital market assumptions and keeps them as
// the household's latest vintage, handing back the vintage as kept. A
// later vintage than the one held moves that one to the previous, so
// what the new one moves can be read against it; the same vintage again
// replaces the latest and leaves the previous as it was, since a vintage
// is compared with the one before it and not with itself; and an
// earlier one, as a stale copy would be, is refused rather than kept. An
// action answers a POST from anywhere, so it checks the session before
// anything goes out to BlackRock. BlackRock not answering, or answering
// with anything but its workbook, is refused, with the status it
// answered when it did, so a block reads apart from an outage; so is a
// workbook no vintage can be read from, in the reader's words. Nothing
// is kept on a refusal: the screen says why under a toast.
export async function pullCma(): Promise<Answer<Cma>> {
  await requireSession();
  const sent = await download();
  if (typeof sent === "string") {
    return refused(sent);
  }
  return amend(({ kept }) => {
    const pulled = readCma(sent);
    return {
      kept: { ...kept, cma: vintagesWith(kept.cma, pulled) },
      result: pulled,
    };
  });
}

// BlackRock's workbook, fresh rather than any copy a cache holds, or why
// it did not come: the status BlackRock answered with instead, its body
// let go unread rather than holding the connection open, or that nothing
// came in time.
async function download(): Promise<string | Uint8Array> {
  try {
    const response = await fetch(latest, {
      cache: "no-store",
      signal: AbortSignal.timeout(patience),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return `BlackRock answered ${String(response.status)} rather than sending its capital market assumptions`;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return "BlackRock did not send its capital market assumptions";
  }
}

// The vintages held with the one pulled as the latest: the latest held
// moved to the previous when the one pulled is later, the previous held
// kept when it is the same vintage again, and the one pulled refused
// when it is earlier.
function vintagesWith(held: null | Vintages, pulled: Cma): Vintages {
  if (held === null) {
    return { latest: pulled, previous: null };
  }
  const later = monthsBetween(held.latest.vintage, pulled.vintage);
  if (later < 0) {
    throw new Refusal(
      `BlackRock's workbook is its ${vintageName(pulled)} vintage, before the ${vintageName(held.latest)} one already kept`,
    );
  }
  return {
    latest: pulled,
    previous: later === 0 ? held.previous : held.latest,
  };
}
