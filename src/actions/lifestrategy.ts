"use server";

import type { Holdings } from "@/data/lifestrategy";
import type { Answer } from "@/lib/answer";

import { fund, readHoldings, requestOf } from "@/data/lifestrategy";
import { answerOf, refused } from "@/lib/answer";
import { download } from "@/lib/download";
import { requireSession } from "@/lib/session";

// Pulls what LifeStrategy 80% Equity holds from Vanguard and hands it
// back for the browser to lay over the categories of the file it has,
// keeping nothing, since the file the targets are written into never
// leaves the browser. It is answered as a save is, with the holdings or
// why they were refused, since the screen hears every answer the one
// way. An action answers a POST from anywhere, so it checks the
// session before anything goes out to Vanguard. Vanguard not answering,
// or answering with anything but the holdings, is refused, with the
// status it answered when it did, so a block reads apart from an
// outage; so is an answer no holding can be read from, in the reader's
// words.
export async function pullLifeStrategy(): Promise<Answer<Holdings>> {
  await requireSession();
  const sent = await download(
    requestOf(),
    "Vanguard",
    `what ${fund.name} holds`,
  );
  return typeof sent === "string"
    ? refused(sent)
    : answerOf(() => readHoldings(sent));
}
