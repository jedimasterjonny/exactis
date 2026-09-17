import type { Cadence } from "@/data/accounts";
import type { Option } from "@/lib/options";

import { optionsOf } from "@/lib/options";

// What a cadence is called where a dialog offers it: how often the sum
// is paid.
const labels: Record<Cadence, string> = { month: "A month", year: "A year" };

// The cadence as a figure's suffix, "£500 / mo", wherever a ledger writes
// what is paid at one.
export const cadenceAbbreviations: Record<Cadence, string> = {
  month: "mo",
  year: "yr",
};

// The choices in the order every dialog offers them, the year first.
export const cadenceOptions: readonly Option<Cadence>[] = optionsOf(labels, [
  "year",
  "month",
]);
