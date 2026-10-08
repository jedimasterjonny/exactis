"use server";

import type { Account, Purchase } from "@/data/accounts";
import type { Pulled } from "@/data/house-prices";
import type { Answer } from "@/lib/answer";

import { addressOf, readIndex, revalued, worthIn } from "@/data/house-prices";
import { Refusal, refused } from "@/lib/answer";
import { counted } from "@/lib/count";
import { download } from "@/lib/download";
import { formatMonth, isOnOrBefore, today } from "@/lib/months";
import { replaced } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { amend, getHousehold } from "@/store/household";

// The household's one house, with when it was bought.
interface House {
  readonly account: Account;
  readonly bought: Purchase;
}

// Pulls the Land Registry's house price index from the month the house
// was bought in, writes the house into every point since off it, sets
// the house's balance to what it is worth in the month the balances
// are as of, over whatever was typed, dated today, and keeps the
// purchase month it scaled from, the day it was pulled on and the month
// it ran to over whatever the household held, handing back what was
// kept with the house's name and worth for the toast. An action answers
// a POST from anywhere, so it checks the session before anything goes
// out to the Registry. The house is read first, since the index is
// asked for from the month it was bought in: a household listing no
// house has nothing to revalue, and one listing two has houses the
// points cannot tell apart, so each is refused before anything is asked
// for. The house is read again with the household the pull is kept
// over, and one changed since, as a save while the index was on its way
// would change it, is refused rather than revalued from a purchase it
// no longer holds. A Registry that does not answer, or answers with
// anything but its index, is refused, with the status it answered when
// it did, so a block reads apart from an outage; so is an answer no
// index can be read from, in the reader's words, and one running to a
// month before the one already pulled, as a stale copy of it would.
// Nothing is kept on a refusal: the screen says why under a toast.
export async function pullHousePrices(): Promise<Answer<Pulled>> {
  await requireSession();
  const asked = houseIn((await getHousehold()).accounts);
  if ("short" in asked) {
    return refused(asked.short);
  }
  const sent = await download(
    addressOf(asked.bought.month),
    "The Land Registry",
    "its house price index",
  );
  if (typeof sent === "string") {
    return refused(sent);
  }
  return amend(({ kept }) => {
    if (JSON.stringify(houseIn(kept.accounts)) !== JSON.stringify(asked)) {
      throw new Refusal(
        "The house changed while its prices were pulled, so nothing was kept; pull them again",
      );
    }
    const { account, bought } = asked;
    const index = readIndex(sent, bought.month);
    if (
      kept.housePrices !== null &&
      !isOnOrBefore(kept.housePrices.to, index.to)
    ) {
      throw new Refusal(
        `The Land Registry's index runs to ${formatMonth(index.to)}, before the ${formatMonth(kept.housePrices.to)} already pulled`,
      );
    }
    const housePrices = { from: bought.month, pulledOn: today(), to: index.to };
    const worth = worthIn(kept.asOf, bought, index);
    return {
      kept: {
        ...kept,
        accounts: replaced(kept.accounts, {
          ...account,
          balance: worth,
          setOn: today(),
        }),
        housePrices,
        points: revalued(kept.points, bought, index),
      },
      result: { ...housePrices, name: account.name, worth },
    };
  });
}

// The one house the accounts list, with when it was bought, or why
// there is none to revalue, as the CMA says why it derives no rates.
function houseIn(
  accounts: readonly Account[],
): House | { readonly short: string } {
  const houses = accounts.flatMap((account) =>
    account.kind === "house" && account.bought !== undefined
      ? [{ account, bought: account.bought }]
      : [],
  );
  const [house, ...more] = houses;
  if (house === undefined) {
    return { short: "No house is listed, so there is nothing to revalue" };
  }
  return more.length > 0
    ? {
        short: `The points carry one house, and the household lists ${counted(houses.length, "house")}`,
      }
    : house;
}
