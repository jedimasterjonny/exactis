import type { NextRequest } from "next/server";

import { balancesSheet } from "@/data/balances-sheet";
import { stamped } from "@/data/shapes";
import { today } from "@/lib/months";
import { readShown } from "@/store/household";

// The branch open handed out as a file to keep: the household, or the
// scenario open, as a save would write it, stamped with the shape it is
// kept in, so the app that reads it back carries it into its own. It is
// read as a page reads it, so the session is checked and a cookie naming
// a scenario dropped in another tab hands out the household, as the
// screen in this one shows it, rather than failing a download that has
// no way to say why. A latest version the rules refuse still fails it,
// but under the chain of shapes that is a bug rather than a state the
// store is left in. The file is named for the branch and the day, a
// scenario by its name as typed, encoded as RFC 8187 has it, the
// characters encodeURIComponent leaves alone escaped too, since an
// apostrophe is what divides the value from its charset; and it is never
// cached, since it is the whole household and changes with every save.
// Reading the cookie is what keeps it from being prerendered, so no
// segment config is needed.
//
// Asked for as CSV, it hands out the balances instead, as one row of the
// owner's balances sheet to paste under the rows it holds, named and
// never cached as the household is. The row is dated as the balances
// screen dates the set, by the oldest day a balance was set on: closing
// the month stamps every balance with one day, and one balance corrected
// after it should not redate the whole row to the day of the correction.
// Where no balance carries a day the row is dated today.
export async function GET(request: NextRequest): Promise<Response> {
  const { kept, scenario } = await readShown();
  const branch = scenario === "" ? "household" : scenario;
  if (request.nextUrl.searchParams.get("as") === "csv") {
    // No balance is set after today, so the oldest is found from it.
    const date = kept.accounts
      .flatMap(({ setOn }) => setOn ?? [])
      .reduce((day, other) => (other < day ? other : day), today());
    return new Response(balancesSheet(kept.accounts, date), {
      headers: {
        "cache-control": "no-store",
        "content-disposition": attachment(
          `exactis-balances-${branch}-${date}.csv`,
        ),
        "content-type": "text/csv; charset=utf-8",
      },
    });
  }
  return Response.json(stamped(kept), {
    headers: {
      "cache-control": "no-store",
      "content-disposition": attachment(`exactis-${branch}-${today()}.json`),
    },
  });
}

// A download named as given, encoded as RFC 8187 has it.
function attachment(name: string): string {
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}
