import type { LineValues } from "@/data/schedule";

// An expense line is money going out over a run of years: the household's
// spending, a child's nursery, a loan's payments, a late-life allowance.
// It holds what every line holds and nothing more: what the money is for
// is its name's to say, since nothing reads a kind of spending, and a
// loan's payments are told apart by the loan they pay. Lines overlap
// freely, as income lines do: retirement living is a line that starts
// where household spending stops, not an edit to it. The id is the line's
// identity, handed out by the store in the order lines were added, which
// is the order they are listed in. A line that is a loan's payments
// carries that loan's id, so the engine counts the payment once and the
// house dialog finds the line; any other line carries none.
export interface ExpenseLine extends LineValues {
  readonly id: number;
  readonly pays?: number;
}
