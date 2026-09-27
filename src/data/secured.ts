import type { Account, AccountKind, AccountValues } from "@/data/accounts";
import type { ExpenseLineValues } from "@/data/expenses";

// An asset and the loan secured on it, as the store holds them: two
// accounts the loan links, or the asset alone when it is owned
// outright. A house and a car are the same shape here, which is why
// this is one type and not one per asset: the names differed, the
// members never did, so nothing was ever kept from standing for
// anything else.
export interface Secured {
  readonly asset: Account;
  readonly loan: Account | null;
}

// What an asset's model lays out to be written together: the asset,
// and the loan secured on it with its payments, or none for an asset
// owned outright.
export interface SecuredRecords {
  readonly asset: AccountValues;
  readonly loan: Borrowing | null;
}

// The asset as its model hands it to be written: its own kind, its
// name, what it is worth, and the rate it grows at, below nothing for
// one that loses value.
interface Asset {
  readonly kind: Extract<AccountKind, "car" | "house">;
  readonly name: string;
  readonly rate: number;
  readonly value: number;
}

// A loan secured on an asset and the line of its payments: the loan
// carries what is owed and the rate it is charged at, the line what is
// paid and until when. The store holds them apart and every asset's
// model writes them together, so they travel as one.
interface Borrowing {
  readonly account: AccountValues;
  readonly line: ExpenseLineValues;
}

// The loan as its asset's model hands it to be written: its name, what
// is owed, whole pounds and positive, the balloon the payments leave
// standing, the rate it is charged at and what is paid a month.
interface Loan {
  readonly balance: number;
  readonly balloon: number;
  readonly name: string;
  readonly payment: number;
  readonly rate: number;
}

// Whether a loan owes something, pays something and is charged a rate
// no lower than nothing, which is what the store takes of the loan on
// any asset.
export function owes(loan: Omit<Loan, "balloon" | "name">): boolean {
  return loan.balance > 0 && loan.payment > 0 && loan.rate >= 0;
}

// The records an asset is written as, whatever the asset. It is an
// account of its own kind at its own fixed rate, since the plan rate is
// the wrappers'; it is paid nothing, so its cadence is the one a
// contribution of nothing reads back as. A loan against it is a debt
// owing the balance, charged the rate as its growth, paid the payment
// a month as its contribution, which is what the ledger shows against
// it, and left owing the balloon, and its payments are a debt line of
// the same a month, fixed in nominal terms as a loan's payment is,
// from the plan's first year and open-ended as saved: when its
// payments end is the loan's to say, worked out from it whenever the
// household is read, so it moves with the month the balances are as
// of. The engine counts the payment once, as the line, since it leaves
// the contribution of a loan a line pays out of the month's fixed sums.
// Both are named as the asset's model names the loan.
export function securedRecords(
  asset: Asset,
  loan: Loan | null,
  plan: { readonly from: number },
): SecuredRecords {
  const held: AccountValues = {
    balance: asset.value,
    balloon: 0,
    cadence: "year",
    cap: 0,
    contribution: 0,
    funding: "fixed",
    growth: "fixed",
    isAlwaysFunded: false,
    kind: asset.kind,
    name: asset.name,
    owner: null,
    rate: asset.rate,
  };
  if (loan === null) {
    return { asset: held, loan: null };
  }
  return {
    asset: held,
    loan: {
      account: {
        balance: -loan.balance,
        balloon: loan.balloon,
        cadence: "month",
        cap: 0,
        contribution: loan.payment,
        funding: "fixed",
        growth: "fixed",
        isAlwaysFunded: false,
        kind: "debt",
        name: loan.name,
        owner: null,
        rate: loan.rate,
      },
      line: {
        amount: loan.payment,
        cadence: "month",
        endsAfter: 0,
        endsAt: null,
        firstYear: plan.from,
        growth: "nominal",
        kind: "debt",
        lastMonth: null,
        lastYear: null,
        name: loan.name,
        startsAt: null,
      },
    },
  };
}
