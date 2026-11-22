"use client";

import type { JSX } from "react";

import { useState } from "react";

import type {
  CashAccount,
  Holding,
  SecuritiesAccount,
  TransactionType,
} from "@/data/portfolio";
import type { Option } from "@/lib/options";

import { FieldRow } from "@/components/app/atoms/field-row";
import { Note } from "@/components/app/atoms/note";
import { DateField } from "@/components/app/molecules/date-field";
import {
  CurrencyField,
  SharesField,
} from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { transactionTypeGroups, transactionTypeLabels } from "@/data/portfolio";

export interface NewPortfolioTransaction {
  readonly accountId?: string;
  readonly amount: number;
  readonly currency: string;
  readonly date: string;
  readonly fees: number;
  readonly note?: string;
  readonly otherAccountId?: string;
  readonly otherPortfolioId?: string;
  readonly portfolioId?: string;
  readonly securityId?: string;
  readonly shares: number;
  readonly taxes: number;
  readonly type: TransactionType;
}

type AccountsLayout =
  | "cash-and-security"
  | "cash-only"
  | "cash-transfer"
  | "securities-and-cash"
  | "securities-and-currency"
  | "securities-transfer";

type DeliveryCurrency = (typeof deliveryCurrencies)[number];

interface PortfolioTransactionDialogProps {
  readonly baseCurrency: string;
  readonly cashAccounts: readonly CashAccount[];
  readonly holdings: readonly Holding[];
  readonly initialDraft?: Partial<TransactionFormValues>;
  readonly onAdd: (draft: NewPortfolioTransaction) => void;
  readonly onDismiss: () => void;
  readonly securitiesAccounts: readonly SecuritiesAccount[];
  readonly today: string;
}

interface TransactionFormValues {
  readonly accountId: string;
  readonly amount: number;
  readonly currency: string;
  readonly date: string;
  readonly fees: number;
  readonly note: string;
  readonly otherAccountId: string;
  readonly otherPortfolioId: string;
  readonly portfolioId: string;
  readonly securityId: string;
  readonly shares: number;
  readonly taxes: number;
  readonly type: TransactionType;
}

interface TypeSpec {
  readonly accounts: AccountsLayout;
  readonly amountHint?: string;
  readonly amountLabel: string;
  readonly hasCosts: boolean;
  readonly hasShares: boolean;
  readonly isAmountOptional: boolean;
}

const deliveryCurrencies = ["GBP", "USD", "EUR"] as const;

const deliveryCurrencyOptions: readonly Option<DeliveryCurrency>[] =
  deliveryCurrencies.map((code) => ({ label: code, value: code }));

// The preview dialog for adding any of Portfolio Performance's fifteen
// transaction types. Mounted while open so state starts fresh on every
// opening; switching type adapts accounts, shares, currency and cost
// fields cleanly without carrying stale fields into the saved draft.
export function PortfolioTransactionDialog({
  baseCurrency,
  cashAccounts,
  holdings,
  initialDraft,
  onAdd,
  onDismiss,
  securitiesAccounts,
  today,
}: PortfolioTransactionDialogProps): JSX.Element {
  const activeSecurities = securitiesAccounts.filter(
    (account) => !account.isRetired,
  );
  const activeCash = cashAccounts.filter((account) => !account.isRetired);
  const sortedHoldings = holdings
    .filter((holding) => !holding.isRetired)
    .toSorted((one, other) => one.name.localeCompare(other.name));

  const defaults = initialSelectionOf({
    activeCash,
    activeSecurities,
    initialDraft,
    sortedHoldings,
  });

  const [type, setType] = useState<TransactionType>(
    initialDraft?.type ?? "purchase",
  );
  const [date, setDate] = useState(initialDraft?.date ?? today);
  const [portfolioId, setPortfolioId] = useState(defaults.portfolioId);
  const [otherPortfolioId, setOtherPortfolioId] = useState(
    defaults.otherPortfolioId,
  );
  const [accountId, setAccountId] = useState(defaults.accountId);
  const [otherAccountId, setOtherAccountId] = useState(defaults.otherAccountId);
  const [securityId, setSecurityId] = useState(defaults.securityId);
  const [deliveryCurrency, setDeliveryCurrency] = useState<DeliveryCurrency>(
    () => deliveryCurrencyOf(initialDraft?.currency ?? baseCurrency),
  );
  const [shares, setShares] = useState<null | number>(
    initialDraft?.shares ?? null,
  );
  const [amount, setAmount] = useState<null | number>(
    initialDraft?.amount ?? null,
  );
  const [fees, setFees] = useState<null | number>(initialDraft?.fees ?? null);
  const [taxes, setTaxes] = useState<null | number>(
    initialDraft?.taxes ?? null,
  );
  const [note, setNote] = useState(initialDraft?.note ?? "");

  const spec = typeSpecOf(type);
  const hasSecurity = spec.hasShares || spec.accounts === "cash-and-security";
  const effectiveCurrency = currencyForType(spec.accounts, {
    accountId,
    activeCash,
    baseCurrency,
    deliveryCurrency,
  });

  const securitiesOptions = accountOptionsOf(
    activeSecurities,
    "No securities accounts",
  );
  const cashOptions = cashAccountOptionsOf(activeCash);
  const securityOptions: readonly Option<string>[] =
    sortedHoldings.length === 0
      ? [{ label: "No securities", value: "" }]
      : sortedHoldings.map((holding) => ({
          label: holding.name,
          value: holding.id,
        }));

  const isValidAccounts = hasValidAccounts(spec.accounts, {
    accountId,
    activeCashCount: activeCash.length,
    activeSecuritiesCount: activeSecurities.length,
    otherAccountId,
    otherPortfolioId,
    portfolioId,
  });
  const isValidAmount =
    spec.isAmountOptional || (amount !== null && amount > 0);
  const isValidShares = !spec.hasShares || (shares !== null && shares > 0);
  const isValidSecurity = !hasSecurity || securityId !== "";
  const canSave =
    isValidIsoDate(date) &&
    isValidAccounts &&
    isValidAmount &&
    isValidShares &&
    isValidSecurity;

  const chosenSecurity = sortedHoldings.find(
    (holding) => holding.id === securityId,
  );
  const typeLabel = transactionTypeLabels[type];
  const title =
    hasSecurity && chosenSecurity !== undefined
      ? `${typeLabel} · ${chosenSecurity.name}`
      : `New ${typeLabel.toLowerCase()}`;

  function selectTradePortfolio(nextPortfolioId: string): void {
    setPortfolioId(nextPortfolioId);
    const referenceId = activeSecurities.find(
      (account) => account.id === nextPortfolioId,
    )?.referenceAccountId;
    if (
      referenceId !== undefined &&
      activeCash.some((account) => account.id === referenceId)
    ) {
      setAccountId(referenceId);
    }
  }

  function selectType(nextType: TransactionType): void {
    setType(nextType);
    setAmount(null);
    setFees(null);
    setTaxes(null);
    setShares(null);
    if (nextType === "cash-transfer") {
      setOtherAccountId(distinctOtherId(accountId, otherAccountId, activeCash));
    }
    if (nextType === "security-transfer") {
      setOtherPortfolioId(
        distinctOtherId(portfolioId, otherPortfolioId, activeSecurities),
      );
    }
  }

  function save(): void {
    const trimmedNote = note.trim();
    const resolvedShares = shares ?? 0;
    const hasPortfolio =
      spec.accounts === "securities-and-cash" ||
      spec.accounts === "securities-and-currency" ||
      spec.accounts === "securities-transfer";
    const hasCash =
      spec.accounts === "securities-and-cash" ||
      spec.accounts === "cash-transfer" ||
      spec.accounts === "cash-and-security" ||
      spec.accounts === "cash-only";

    onAdd({
      ...(hasCash && { accountId }),
      amount: amount ?? 0,
      currency: effectiveCurrency,
      date,
      fees: spec.hasCosts ? (fees ?? 0) : 0,
      ...(trimmedNote !== "" && { note: trimmedNote }),
      ...(spec.accounts === "cash-transfer" && { otherAccountId }),
      ...(spec.accounts === "securities-transfer" && { otherPortfolioId }),
      ...(hasPortfolio && { portfolioId }),
      ...(hasSecurity && { securityId }),
      shares: spec.hasShares ? resolvedShares : 0,
      taxes: spec.hasCosts ? (taxes ?? 0) : 0,
      type,
    });
  }

  return (
    <EditDialog
      canSave={canSave}
      confirm="Add preview"
      eyebrow="New transaction"
      isWide
      onDismiss={onDismiss}
      onSave={save}
      title={title}
    >
      <FieldRow layout="pair">
        <SelectField<TransactionType>
          groups={transactionTypeGroups}
          label="Type"
          onValueChange={selectType}
          value={type}
        />
        <DateField label="Date" onValueChange={setDate} value={date} />
      </FieldRow>

      <AccountFields
        accountId={accountId}
        cashCount={activeCash.length}
        cashOptions={cashOptions}
        deliveryCurrency={deliveryCurrency}
        layout={spec.accounts}
        onAccountChange={setAccountId}
        onDeliveryCurrencyChange={setDeliveryCurrency}
        onOtherAccountChange={setOtherAccountId}
        onOtherPortfolioChange={setOtherPortfolioId}
        onPortfolioChange={setPortfolioId}
        onSecurityChange={setSecurityId}
        onTradePortfolioChange={selectTradePortfolio}
        otherAccountId={otherAccountId}
        otherPortfolioId={otherPortfolioId}
        portfolioId={portfolioId}
        securitiesCount={activeSecurities.length}
        securitiesOptions={securitiesOptions}
        securityCount={sortedHoldings.length}
        securityId={securityId}
        securityOptions={securityOptions}
      />

      {spec.hasShares && (
        <FieldRow layout="pair">
          <SelectField
            hint={
              sortedHoldings.length === 0 ? "Add a security first" : undefined
            }
            isDisabled={sortedHoldings.length === 0}
            label="Security"
            onValueChange={setSecurityId}
            options={securityOptions}
            value={securityId}
          />
          <SharesField
            label="Shares"
            min={0}
            onCleared={() => {
              setShares(null);
            }}
            onValueCommitted={setShares}
            value={shares}
          />
        </FieldRow>
      )}

      {spec.hasCosts ? (
        <FieldRow layout="triple">
          <CurrencyField
            currency={effectiveCurrency}
            hint={spec.amountHint}
            key={`${type}-${effectiveCurrency}`}
            label={spec.amountLabel}
            min={0}
            onCleared={() => {
              setAmount(null);
            }}
            onValueCommitted={setAmount}
            value={amount}
          />
          <CurrencyField
            currency={effectiveCurrency}
            key={`fees-${effectiveCurrency}`}
            label="Fees"
            min={0}
            onCleared={() => {
              setFees(null);
            }}
            onValueCommitted={setFees}
            value={fees}
          />
          <CurrencyField
            currency={effectiveCurrency}
            key={`taxes-${effectiveCurrency}`}
            label="Taxes"
            min={0}
            onCleared={() => {
              setTaxes(null);
            }}
            onValueCommitted={setTaxes}
            value={taxes}
          />
        </FieldRow>
      ) : (
        <CurrencyField
          currency={effectiveCurrency}
          hint={spec.amountHint}
          key={`${type}-${effectiveCurrency}`}
          label={spec.amountLabel}
          min={0}
          onCleared={() => {
            setAmount(null);
          }}
          onValueCommitted={setAmount}
          value={amount}
        />
      )}

      <TextField defaultValue={note} label="Note" onValueChange={setNote} />
      <Note>
        Shown in this view only. Balances and holdings are not recalculated, and
        changes are not saved to the file yet.
      </Note>
    </EditDialog>
  );
}

// The account (and delivery currency or dividend security) fields for
// Row 2 of the transaction dialog, chosen exhaustively by layout.
function AccountFields({
  accountId,
  cashCount,
  cashOptions,
  deliveryCurrency,
  layout,
  onAccountChange,
  onDeliveryCurrencyChange,
  onOtherAccountChange,
  onOtherPortfolioChange,
  onPortfolioChange,
  onSecurityChange,
  onTradePortfolioChange,
  otherAccountId,
  otherPortfolioId,
  portfolioId,
  securitiesCount,
  securitiesOptions,
  securityCount,
  securityId,
  securityOptions,
}: {
  readonly accountId: string;
  readonly cashCount: number;
  readonly cashOptions: readonly Option<string>[];
  readonly deliveryCurrency: DeliveryCurrency;
  readonly layout: AccountsLayout;
  readonly onAccountChange: (id: string) => void;
  readonly onDeliveryCurrencyChange: (currency: DeliveryCurrency) => void;
  readonly onOtherAccountChange: (id: string) => void;
  readonly onOtherPortfolioChange: (id: string) => void;
  readonly onPortfolioChange: (id: string) => void;
  readonly onSecurityChange: (id: string) => void;
  readonly onTradePortfolioChange: (id: string) => void;
  readonly otherAccountId: string;
  readonly otherPortfolioId: string;
  readonly portfolioId: string;
  readonly securitiesCount: number;
  readonly securitiesOptions: readonly Option<string>[];
  readonly securityCount: number;
  readonly securityId: string;
  readonly securityOptions: readonly Option<string>[];
}): JSX.Element {
  const noSecuritiesHint =
    securitiesCount === 0 ? "Add a securities account first" : undefined;
  const noCashHint = cashCount === 0 ? "Add a cash account first" : undefined;
  const noSecurityHint =
    securityCount === 0 ? "Add a security first" : undefined;

  switch (layout) {
    case "cash-and-security":
      return (
        <FieldRow layout="pair">
          <SelectField
            hint={noCashHint}
            isDisabled={cashCount === 0}
            label="Cash account"
            onValueChange={onAccountChange}
            options={cashOptions}
            value={accountId}
          />
          <SelectField
            hint={noSecurityHint}
            isDisabled={securityCount === 0}
            label="Security"
            onValueChange={onSecurityChange}
            options={securityOptions}
            value={securityId}
          />
        </FieldRow>
      );
    case "cash-only":
      return (
        <SelectField
          hint={noCashHint}
          isDisabled={cashCount === 0}
          label="Cash account"
          onValueChange={onAccountChange}
          options={cashOptions}
          value={accountId}
        />
      );
    case "cash-transfer":
      return (
        <FieldRow layout="pair">
          <SelectField
            hint={
              cashCount < 2 ? "Add at least two cash accounts first" : undefined
            }
            isDisabled={cashCount < 2}
            label="From cash account"
            onValueChange={onAccountChange}
            options={cashOptions}
            value={accountId}
          />
          <SelectField
            hint={transferDestinationHint(
              cashCount,
              accountId === otherAccountId,
              "cash accounts",
            )}
            isDisabled={cashCount < 2}
            label="To cash account"
            onValueChange={onOtherAccountChange}
            options={cashOptions}
            value={otherAccountId}
          />
        </FieldRow>
      );
    case "securities-and-cash":
      return (
        <FieldRow layout="pair">
          <SelectField
            hint={noSecuritiesHint}
            isDisabled={securitiesCount === 0}
            label="Securities account"
            onValueChange={onTradePortfolioChange}
            options={securitiesOptions}
            value={portfolioId}
          />
          <SelectField
            hint={noCashHint}
            isDisabled={cashCount === 0}
            label="Cash account"
            onValueChange={onAccountChange}
            options={cashOptions}
            value={accountId}
          />
        </FieldRow>
      );
    case "securities-and-currency":
      return (
        <FieldRow layout="pair">
          <SelectField
            hint={noSecuritiesHint}
            isDisabled={securitiesCount === 0}
            label="Securities account"
            onValueChange={onPortfolioChange}
            options={securitiesOptions}
            value={portfolioId}
          />
          <SelectField<DeliveryCurrency>
            label="Currency"
            onValueChange={onDeliveryCurrencyChange}
            options={deliveryCurrencyOptions}
            value={deliveryCurrency}
          />
        </FieldRow>
      );
    case "securities-transfer":
      return (
        <FieldRow layout="pair">
          <SelectField
            hint={
              securitiesCount < 2
                ? "Add at least two securities accounts first"
                : undefined
            }
            isDisabled={securitiesCount < 2}
            label="From securities account"
            onValueChange={onPortfolioChange}
            options={securitiesOptions}
            value={portfolioId}
          />
          <SelectField
            hint={transferDestinationHint(
              securitiesCount,
              portfolioId === otherPortfolioId,
              "securities accounts",
            )}
            isDisabled={securitiesCount < 2}
            label="To securities account"
            onValueChange={onOtherPortfolioChange}
            options={securitiesOptions}
            value={otherPortfolioId}
          />
        </FieldRow>
      );
  }
}

function accountOptionsOf(
  accounts: readonly { readonly id: string; readonly name: string }[],
  emptyLabel: string,
): readonly Option<string>[] {
  return accounts.length === 0
    ? [{ label: emptyLabel, value: "" }]
    : accounts.map((account) => ({ label: account.name, value: account.id }));
}

function cashAccountOptionsOf(
  accounts: readonly CashAccount[],
): readonly Option<string>[] {
  return accounts.length === 0
    ? [{ label: "No cash accounts", value: "" }]
    : accounts.map((account) => ({
        label: `${account.name} (${account.currency})`,
        value: account.id,
      }));
}

function currencyForType(
  layout: AccountsLayout,
  {
    accountId,
    activeCash,
    baseCurrency,
    deliveryCurrency,
  }: {
    readonly accountId: string;
    readonly activeCash: readonly CashAccount[];
    readonly baseCurrency: string;
    readonly deliveryCurrency: DeliveryCurrency;
  },
): string {
  if (layout === "securities-and-currency") {
    return deliveryCurrency;
  }
  if (layout === "securities-transfer") {
    return baseCurrency;
  }
  return (
    activeCash.find((account) => account.id === accountId)?.currency ??
    baseCurrency
  );
}

function deliveryCurrencyOf(code: string): DeliveryCurrency {
  return deliveryCurrencies.find((currency) => currency === code) ?? "GBP";
}

function distinctOtherId(
  fromId: string,
  currentOtherId: string,
  accounts: readonly { readonly id: string }[],
): string {
  if (fromId !== currentOtherId) {
    return currentOtherId;
  }
  return (
    accounts.find((account) => account.id !== fromId)?.id ?? currentOtherId
  );
}

function hasValidAccounts(
  layout: AccountsLayout,
  {
    accountId,
    activeCashCount,
    activeSecuritiesCount,
    otherAccountId,
    otherPortfolioId,
    portfolioId,
  }: {
    readonly accountId: string;
    readonly activeCashCount: number;
    readonly activeSecuritiesCount: number;
    readonly otherAccountId: string;
    readonly otherPortfolioId: string;
    readonly portfolioId: string;
  },
): boolean {
  switch (layout) {
    case "cash-and-security":
    case "cash-only":
      return accountId !== "";
    case "cash-transfer":
      return (
        activeCashCount >= 2 &&
        accountId !== "" &&
        otherAccountId !== "" &&
        accountId !== otherAccountId
      );
    case "securities-and-cash":
      return portfolioId !== "" && accountId !== "";
    case "securities-and-currency":
      return portfolioId !== "";
    case "securities-transfer":
      return (
        activeSecuritiesCount >= 2 &&
        portfolioId !== "" &&
        otherPortfolioId !== "" &&
        portfolioId !== otherPortfolioId
      );
  }
}

function initialSelectionOf({
  activeCash,
  activeSecurities,
  initialDraft,
  sortedHoldings,
}: {
  readonly activeCash: readonly CashAccount[];
  readonly activeSecurities: readonly SecuritiesAccount[];
  readonly initialDraft: Partial<TransactionFormValues> | undefined;
  readonly sortedHoldings: readonly Holding[];
}): {
  readonly accountId: string;
  readonly otherAccountId: string;
  readonly otherPortfolioId: string;
  readonly portfolioId: string;
  readonly securityId: string;
} {
  const portfolioId =
    validOptionId(initialDraft?.portfolioId, activeSecurities) ??
    activeSecurities[0]?.id ??
    "";
  const otherPortfolioId =
    validOptionId(initialDraft?.otherPortfolioId, activeSecurities) ??
    activeSecurities.find((account) => account.id !== portfolioId)?.id ??
    "";
  const referenceCashId = activeSecurities.find(
    (account) => account.id === portfolioId,
  )?.referenceAccountId;
  const accountId =
    validOptionId(initialDraft?.accountId, activeCash) ??
    validOptionId(referenceCashId, activeCash) ??
    activeCash[0]?.id ??
    "";
  const otherAccountId =
    validOptionId(initialDraft?.otherAccountId, activeCash) ??
    activeCash.find((account) => account.id !== accountId)?.id ??
    "";
  const securityId =
    validOptionId(initialDraft?.securityId, sortedHoldings) ??
    sortedHoldings[0]?.id ??
    "";
  return {
    accountId,
    otherAccountId,
    otherPortfolioId,
    portfolioId,
    securityId,
  };
}

function isValidIsoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  );
}

function transferDestinationHint(
  count: number,
  isSameAccount: boolean,
  kind: "cash accounts" | "securities accounts",
): string | undefined {
  if (count < 2) {
    return `Add at least two ${kind} first`;
  }
  return isSameAccount ? "Choose a different destination account" : undefined;
}

// Declarative form layout for every Portfolio Performance transaction type.
function typeSpecOf(type: TransactionType): TypeSpec {
  switch (type) {
    case "cash-transfer":
      return {
        accounts: "cash-transfer",
        amountLabel: "Amount",
        hasCosts: false,
        hasShares: false,
        isAmountOptional: false,
      };
    case "deposit":
    case "fee":
    case "fee-refund":
    case "interest":
    case "interest-charge":
    case "removal":
    case "tax":
    case "tax-refund":
      return {
        accounts: "cash-only",
        amountLabel: "Amount",
        hasCosts: false,
        hasShares: false,
        isAmountOptional: false,
      };
    case "dividend":
      return {
        accounts: "cash-and-security",
        amountHint: "After tax and fees",
        amountLabel: "Net received",
        hasCosts: true,
        hasShares: false,
        isAmountOptional: false,
      };
    case "inbound-delivery":
      return {
        accounts: "securities-and-currency",
        amountHint: "Including fees and taxes",
        amountLabel: "Total value",
        hasCosts: true,
        hasShares: true,
        isAmountOptional: false,
      };
    case "outbound-delivery":
      return {
        accounts: "securities-and-currency",
        amountHint: "After fees and taxes",
        amountLabel: "Total value",
        hasCosts: true,
        hasShares: true,
        isAmountOptional: false,
      };
    case "purchase":
      return {
        accounts: "securities-and-cash",
        amountHint: "Including fees and taxes",
        amountLabel: "Total paid",
        hasCosts: true,
        hasShares: true,
        isAmountOptional: false,
      };
    case "sale":
      return {
        accounts: "securities-and-cash",
        amountHint: "After fees and taxes",
        amountLabel: "Net proceeds",
        hasCosts: true,
        hasShares: true,
        isAmountOptional: false,
      };
    case "security-transfer":
      return {
        accounts: "securities-transfer",
        amountHint: "Optional market value at transfer; moves no cash",
        amountLabel: "Valuation",
        hasCosts: false,
        hasShares: true,
        isAmountOptional: true,
      };
  }
}

function validOptionId(
  candidate: string | undefined,
  items: readonly { readonly id: string }[],
): string | undefined {
  return candidate !== undefined && items.some((item) => item.id === candidate)
    ? candidate
    : undefined;
}
