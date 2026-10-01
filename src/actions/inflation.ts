"use server";

import type { Curve } from "@/data/inflation";
import type { Answer } from "@/lib/answer";

import { Refusal, refused } from "@/lib/answer";
import { download } from "@/lib/download";
import { requireSession } from "@/lib/session";
import { readCurve } from "@/lib/yield-curves";
import { amend } from "@/store/household";

// Where the Bank of England publishes the month's yield curves, as one
// zip, replaced each working day.
const latest =
  "https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip";

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
  const sent = await download(
    latest,
    "The Bank of England",
    "its yield curves",
  );
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
