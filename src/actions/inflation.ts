"use server";

import type { Curve } from "@/data/inflation";
import type { Answer } from "@/lib/answer";

import { Refusal, refused } from "@/lib/answer";
import { requireSession } from "@/lib/session";
import { readCurve } from "@/lib/yield-curves";
import { amend } from "@/store/household";

// Where the Bank of England publishes the month's yield curves, as one
// zip, replaced each working day.
const latest =
  "https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip";

// How long the Bank has to send the file, which is some 400KB and
// arrives in a second or two.
const patience = 30_000;

// Pulls the Bank's latest yield curves and keeps the implied inflation
// curve they give over whatever curve the household held, handing back
// the curve as kept. An action answers a POST from anywhere, so it
// checks the session before anything goes out to the Bank. A Bank that
// does not answer, or answers with anything but its file, is refused,
// with the status it answered when it did, so a block reads apart from
// an outage; so is a file no curve can be read from, in the reader's
// words, and a file whose curve is older than the one kept, as a stale
// copy of it would be. Nothing is kept on a refusal: the screen says why
// under a toast.
export async function pullCurve(): Promise<Answer<Curve>> {
  await requireSession();
  const sent = await download();
  if (typeof sent === "string") {
    return refused(sent);
  }
  return amend(({ kept }) => {
    const curve = readCurve(sent);
    if (kept.curve !== null && curve.asOf < kept.curve.asOf) {
      throw new Refusal(
        `The Bank's file runs to ${curve.asOf}, before the curve already kept for ${kept.curve.asOf}`,
      );
    }
    return { kept: { ...kept, curve }, result: curve };
  });
}

// The Bank's file, fresh rather than any copy a cache holds, or why it
// did not come: the status the Bank answered with instead, its body let
// go unread rather than holding the connection open, or that nothing
// came in time.
async function download(): Promise<string | Uint8Array> {
  try {
    const response = await fetch(latest, {
      cache: "no-store",
      signal: AbortSignal.timeout(patience),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return `The Bank of England answered ${String(response.status)} rather than sending its yield curves`;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return "The Bank of England did not send its yield curves";
  }
}
