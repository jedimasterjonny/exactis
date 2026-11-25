"use client";

import type { JSX } from "react";

import { useState } from "react";

import type {
  CashAccount,
  Holding,
  NewPortfolioTransaction,
  SecuritiesAccount,
  TransactionType,
} from "@/data/portfolio";
import type { Option } from "@/lib/options";

import { addPortfolioTransaction } from "@/actions/portfolio";
import { FieldRow } from "@/components/app/atoms/field-row";
import { DateField } from "@/components/app/molecules/date-field";
import {
  CurrencyField,
  SharesField,
} from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import {
  isIsoCalendarDate,
  maxPortfolioMoney,
  maxPortfolioScaled,
  transactionTypeGroups,
  transactionTypeLabels,
} from "@/data/portfolio";
import { useSender } from "@/hooks/use-sender";
import { formatDay } from "@/lib/months";

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
  readonly onDismiss: () => void;
  readonly onSaved: (draft: NewPortfolioTransaction) => void;
  readonly securitiesAccounts: readonly SecuritiesAccount[];
  readonly today: string;
  readonly version: number;
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

// The dialog for appending any of Portfolio Performance's fifteen
// transaction types to the household's stored .portfolio file.
// Switching type adapts accounts, shares, currency and cost fields
// cleanly without carrying stale figures into the saved draft; stale
// refreshes that remove a chosen account or security clear that
// selection to "" with an explicit hint rather than silently falling
// back to another account.
export function PortfolioTransactionDialog({
  baseCurrency,
  cashAccounts,
  holdings,
  initialDraft,
  onDismiss,
  onSaved,
  securitiesAccounts,
  today,
  version,
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
  const { isSending, send } = useSender();

  const resolvedPortfolio = resolveSelection(portfolioId, activeSecurities);
  const resolvedOtherPortfolio = resolveSelection(
    otherPortfolioId,
    activeSecurities,
  );
  const resolvedAccount = resolveSelection(accountId, activeCash);
  const resolvedOtherAccount = resolveSelection(otherAccountId, activeCash);
  const resolvedSecurity = resolveSelection(securityId, sortedHoldings);

  const spec = typeSpecOf(type);
  const hasSecurity = spec.hasShares || spec.accounts === "cash-and-security";
  const fromCash = activeCash.find(
    (account) => account.id === resolvedAccount.id,
  );
  const toCash = activeCash.find(
    (account) => account.id === resolvedOtherAccount.id,
  );
  const isMismatchedTransferCurrency =
    spec.accounts === "cash-transfer" &&
    fromCash !== undefined &&
    toCash !== undefined &&
    fromCash.currency !== toCash.currency;

  const effectiveCurrency = currencyForType(spec.accounts, {
    baseCurrency,
    deliveryCurrency,
    fromCashCurrency: fromCash?.currency,
  });

  const baseSecuritiesOptions = accountOptionsOf(
    activeSecurities,
    "No securities accounts",
  );
  const baseCashOptions = cashAccountOptionsOf(activeCash);
  const baseSecurityOptions: readonly Option<string>[] =
    sortedHoldings.length === 0
      ? [{ label: "No securities", value: "" }]
      : sortedHoldings.map((holding) => ({
          label: holding.name,
          value: holding.id,
        }));
  const securitySelectOptions = withEmptyPlaceholder(
    baseSecurityOptions,
    resolvedSecurity.id,
    "Select a security",
  );

  const amountPence = amount === null ? 0 : Math.round(amount * 100);
  const feesPence = spec.hasCosts && fees !== null ? Math.round(fees * 100) : 0;
  const taxesPence =
    spec.hasCosts && taxes !== null ? Math.round(taxes * 100) : 0;
  const sharesScaled = shares === null ? 0 : Math.round(shares * 1e8);
  const isCostsBounded = type === "purchase" || type === "inbound-delivery";
  const hasExcessCosts =
    isCostsBounded && amountPence >= 1 && feesPence + taxesPence > amountPence;
  const amountError = amountErrorOf(type, hasExcessCosts);

  const isValidAccounts = hasValidAccounts(spec.accounts, {
    accountId: resolvedAccount.id,
    activeCashCount: activeCash.length,
    activeSecuritiesCount: activeSecurities.length,
    isMismatchedTransferCurrency,
    otherAccountId: resolvedOtherAccount.id,
    otherPortfolioId: resolvedOtherPortfolio.id,
    portfolioId: resolvedPortfolio.id,
  });
  const isValidAmount = spec.isAmountOptional || amountPence >= 1;
  const isValidShares = !spec.hasShares || sharesScaled >= 1;
  const isValidSecurity = !hasSecurity || resolvedSecurity.id !== "";
  const canSave =
    isIsoCalendarDate(date) &&
    isValidAccounts &&
    isValidAmount &&
    isValidShares &&
    isValidSecurity &&
    !hasExcessCosts;

  const chosenSecurity = sortedHoldings.find(
    (holding) => holding.id === resolvedSecurity.id,
  );
  const typeLabel = transactionTypeLabels[type];
  const title =
    hasSecurity && chosenSecurity !== undefined
      ? `${typeLabel} · ${chosenSecurity.name}`
      : `New ${typeLabel.toLowerCase()}`;
  const subjectName =
    (hasSecurity ? chosenSecurity?.name : fromCash?.name) ?? "";

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
      setOtherAccountId(
        distinctOtherCashId(resolvedAccount.id, otherAccountId, activeCash),
      );
    }
    if (nextType === "security-transfer") {
      setOtherPortfolioId(
        distinctOtherId(
          resolvedPortfolio.id,
          otherPortfolioId,
          activeSecurities,
        ),
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

    const draft: NewPortfolioTransaction = {
      ...(hasCash && { accountId: resolvedAccount.id }),
      amount: amount ?? 0,
      currency: effectiveCurrency,
      date,
      fees: spec.hasCosts ? (fees ?? 0) : 0,
      ...(trimmedNote !== "" && { note: trimmedNote }),
      ...(spec.accounts === "cash-transfer" && {
        otherAccountId: resolvedOtherAccount.id,
      }),
      ...(spec.accounts === "securities-transfer" && {
        otherPortfolioId: resolvedOtherPortfolio.id,
      }),
      ...(hasPortfolio && { portfolioId: resolvedPortfolio.id }),
      ...(hasSecurity && { securityId: resolvedSecurity.id }),
      shares: spec.hasShares ? resolvedShares : 0,
      taxes: spec.hasCosts ? (taxes ?? 0) : 0,
      type,
    };

    send(async () => addPortfolioTransaction(version, draft), {
      failure: "Transaction not saved",
      onAccepted: () => {
        onSaved(draft);
      },
      success: () => ({
        description: `${typeLabel} · ${subjectName} · ${formatDay(draft.date)}`,
        title: "Transaction saved",
      }),
    });
  }

  return (
    <EditDialog
      canSave={canSave}
      eyebrow="New transaction"
      isSaving={isSending}
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
        accountId={resolvedAccount.id}
        cashCount={activeCash.length}
        cashOptions={baseCashOptions}
        deliveryCurrency={deliveryCurrency}
        isAccountMissing={resolvedAccount.isMissing}
        isMismatchedTransferCurrency={isMismatchedTransferCurrency}
        isOtherAccountMissing={resolvedOtherAccount.isMissing}
        isOtherPortfolioMissing={resolvedOtherPortfolio.isMissing}
        isPortfolioMissing={resolvedPortfolio.isMissing}
        isSecurityMissing={resolvedSecurity.isMissing}
        layout={spec.accounts}
        onAccountChange={setAccountId}
        onDeliveryCurrencyChange={setDeliveryCurrency}
        onOtherAccountChange={setOtherAccountId}
        onOtherPortfolioChange={setOtherPortfolioId}
        onPortfolioChange={setPortfolioId}
        onSecurityChange={setSecurityId}
        onTradePortfolioChange={selectTradePortfolio}
        otherAccountId={resolvedOtherAccount.id}
        otherPortfolioId={resolvedOtherPortfolio.id}
        portfolioId={resolvedPortfolio.id}
        securitiesCount={activeSecurities.length}
        securitiesOptions={baseSecuritiesOptions}
        securityCount={sortedHoldings.length}
        securityId={resolvedSecurity.id}
        securityOptions={securitySelectOptions}
      />

      {spec.hasShares && (
        <FieldRow layout="pair">
          <SelectField
            hint={requiredSelectHint(sortedHoldings.length, {
              emptyHint: "Add a security first",
              isMissing: resolvedSecurity.isMissing,
              missingHint: "Selected security is no longer available",
            })}
            isDisabled={sortedHoldings.length === 0}
            label="Security"
            onValueChange={setSecurityId}
            options={securitySelectOptions}
            value={resolvedSecurity.id}
          />
          <SharesField
            label="Shares"
            max={maxPortfolioScaled}
            min={0}
            onCleared={() => {
              setShares(null);
            }}
            onValueChange={setShares}
            onValueCommitted={setShares}
            value={shares}
          />
        </FieldRow>
      )}

      {spec.hasCosts ? (
        <FieldRow layout="triple">
          <CurrencyField
            currency={effectiveCurrency}
            error={amountError}
            hint={spec.amountHint}
            key={`${type}-${effectiveCurrency}`}
            label={spec.amountLabel}
            max={maxPortfolioMoney}
            min={0}
            onCleared={() => {
              setAmount(null);
            }}
            onValueChange={setAmount}
            onValueCommitted={setAmount}
            value={amount}
          />
          <CurrencyField
            currency={effectiveCurrency}
            key={`fees-${effectiveCurrency}`}
            label="Fees"
            max={maxPortfolioMoney}
            min={0}
            onCleared={() => {
              setFees(null);
            }}
            onValueChange={setFees}
            onValueCommitted={setFees}
            value={fees}
          />
          <CurrencyField
            currency={effectiveCurrency}
            key={`taxes-${effectiveCurrency}`}
            label="Taxes"
            max={maxPortfolioMoney}
            min={0}
            onCleared={() => {
              setTaxes(null);
            }}
            onValueChange={setTaxes}
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
          max={maxPortfolioMoney}
          min={0}
          onCleared={() => {
            setAmount(null);
          }}
          onValueChange={setAmount}
          onValueCommitted={setAmount}
          value={amount}
        />
      )}

      <TextField
        defaultValue={note}
        label="Note"
        maxLength={1000}
        onValueChange={setNote}
      />
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
  isAccountMissing,
  isMismatchedTransferCurrency,
  isOtherAccountMissing,
  isOtherPortfolioMissing,
  isPortfolioMissing,
  isSecurityMissing,
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
  readonly isAccountMissing: boolean;
  readonly isMismatchedTransferCurrency: boolean;
  readonly isOtherAccountMissing: boolean;
  readonly isOtherPortfolioMissing: boolean;
  readonly isPortfolioMissing: boolean;
  readonly isSecurityMissing: boolean;
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
  const missingAccount = "Selected account is no longer available";
  const securitiesHint = requiredSelectHint(securitiesCount, {
    emptyHint: "Add a securities account first",
    isMissing: isPortfolioMissing,
    missingHint: missingAccount,
  });
  const cashHint = requiredSelectHint(cashCount, {
    emptyHint: "Add a cash account first",
    isMissing: isAccountMissing,
    missingHint: missingAccount,
  });
  const securityHint = requiredSelectHint(securityCount, {
    emptyHint: "Add a security first",
    isMissing: isSecurityMissing,
    missingHint: "Selected security is no longer available",
  });
  const primaryCashOptions = withEmptyPlaceholder(
    cashOptions,
    accountId,
    "Select an account",
  );
  const destinationCashOptions = withEmptyPlaceholder(
    cashOptions,
    otherAccountId,
    "Select an account",
  );
  const primaryPortfolioOptions = withEmptyPlaceholder(
    securitiesOptions,
    portfolioId,
    "Select an account",
  );
  const destinationPortfolioOptions = withEmptyPlaceholder(
    securitiesOptions,
    otherPortfolioId,
    "Select an account",
  );

  switch (layout) {
    case "cash-and-security":
      return (
        <FieldRow layout="pair">
          <SelectField
            hint={cashHint}
            isDisabled={cashCount === 0}
            label="Cash account"
            onValueChange={onAccountChange}
            options={primaryCashOptions}
            value={accountId}
          />
          <SelectField
            hint={securityHint}
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
          hint={cashHint}
          isDisabled={cashCount === 0}
          label="Cash account"
          onValueChange={onAccountChange}
          options={primaryCashOptions}
          value={accountId}
        />
      );
    case "cash-transfer":
      return (
        <FieldRow layout="pair">
          <SelectField
            hint={transferSourceHint(
              cashCount,
              isAccountMissing,
              "cash accounts",
            )}
            isDisabled={cashCount < 2}
            label="From cash account"
            onValueChange={onAccountChange}
            options={primaryCashOptions}
            value={accountId}
          />
          <SelectField
            hint={transferDestinationHint(cashCount, {
              isMismatchedCurrency: isMismatchedTransferCurrency,
              isMissing: isOtherAccountMissing,
              isSameAccount: accountId !== "" && accountId === otherAccountId,
              kind: "cash accounts",
            })}
            isDisabled={cashCount < 2}
            label="To cash account"
            onValueChange={onOtherAccountChange}
            options={destinationCashOptions}
            value={otherAccountId}
          />
        </FieldRow>
      );
    case "securities-and-cash":
      return (
        <FieldRow layout="pair">
          <SelectField
            hint={securitiesHint}
            isDisabled={securitiesCount === 0}
            label="Securities account"
            onValueChange={onTradePortfolioChange}
            options={primaryPortfolioOptions}
            value={portfolioId}
          />
          <SelectField
            hint={cashHint}
            isDisabled={cashCount === 0}
            label="Cash account"
            onValueChange={onAccountChange}
            options={primaryCashOptions}
            value={accountId}
          />
        </FieldRow>
      );
    case "securities-and-currency":
      return (
        <FieldRow layout="pair">
          <SelectField
            hint={securitiesHint}
            isDisabled={securitiesCount === 0}
            label="Securities account"
            onValueChange={onPortfolioChange}
            options={primaryPortfolioOptions}
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
            hint={transferSourceHint(
              securitiesCount,
              isPortfolioMissing,
              "securities accounts",
            )}
            isDisabled={securitiesCount < 2}
            label="From securities account"
            onValueChange={onPortfolioChange}
            options={primaryPortfolioOptions}
            value={portfolioId}
          />
          <SelectField
            hint={transferDestinationHint(securitiesCount, {
              isMissing: isOtherPortfolioMissing,
              isSameAccount:
                portfolioId !== "" && portfolioId === otherPortfolioId,
              kind: "securities accounts",
            })}
            isDisabled={securitiesCount < 2}
            label="To securities account"
            onValueChange={onOtherPortfolioChange}
            options={destinationPortfolioOptions}
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

function amountErrorOf(
  type: TransactionType,
  hasExcessCosts: boolean,
): string | undefined {
  if (!hasExcessCosts) {
    return undefined;
  }
  return type === "purchase"
    ? "Fees and taxes cannot exceed total paid"
    : "Fees and taxes cannot exceed total value";
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
    baseCurrency,
    deliveryCurrency,
    fromCashCurrency,
  }: {
    readonly baseCurrency: string;
    readonly deliveryCurrency: DeliveryCurrency;
    readonly fromCashCurrency: string | undefined;
  },
): string {
  if (layout === "securities-and-currency") {
    return deliveryCurrency;
  }
  if (layout === "securities-transfer") {
    return baseCurrency;
  }
  return fromCashCurrency ?? baseCurrency;
}

function deliveryCurrencyOf(code: string): DeliveryCurrency {
  return deliveryCurrencies.find((currency) => currency === code) ?? "GBP";
}

function distinctOtherCashId(
  fromId: string,
  currentOtherId: string,
  accounts: readonly CashAccount[],
): string {
  const fromCurrency = accounts.find(
    (account) => account.id === fromId,
  )?.currency;
  const currentOther = accounts.find(
    (account) => account.id === currentOtherId,
  );
  if (
    currentOther !== undefined &&
    currentOther.id !== fromId &&
    currentOther.currency === fromCurrency
  ) {
    return currentOther.id;
  }
  return (
    accounts.find(
      (account) => account.id !== fromId && account.currency === fromCurrency,
    )?.id ?? distinctOtherId(fromId, currentOtherId, accounts)
  );
}

function distinctOtherId(
  fromId: string,
  currentOtherId: string,
  accounts: readonly { readonly id: string }[],
): string {
  if (
    currentOtherId !== "" &&
    fromId !== currentOtherId &&
    accounts.some((account) => account.id === currentOtherId)
  ) {
    return currentOtherId;
  }
  return accounts.find((account) => account.id !== fromId)?.id ?? "";
}

function hasValidAccounts(
  layout: AccountsLayout,
  {
    accountId,
    activeCashCount,
    activeSecuritiesCount,
    isMismatchedTransferCurrency,
    otherAccountId,
    otherPortfolioId,
    portfolioId,
  }: {
    readonly accountId: string;
    readonly activeCashCount: number;
    readonly activeSecuritiesCount: number;
    readonly isMismatchedTransferCurrency: boolean;
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
        accountId !== otherAccountId &&
        !isMismatchedTransferCurrency
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
  const fromCurrency = activeCash.find(
    (account) => account.id === accountId,
  )?.currency;
  const otherAccountId =
    validOptionId(initialDraft?.otherAccountId, activeCash) ??
    activeCash.find(
      (account) =>
        account.id !== accountId && account.currency === fromCurrency,
    )?.id ??
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

function requiredSelectHint(
  count: number,
  {
    emptyHint,
    isMissing,
    missingHint,
  }: {
    readonly emptyHint: string;
    readonly isMissing: boolean;
    readonly missingHint: string;
  },
): string | undefined {
  if (count === 0) {
    return emptyHint;
  }
  return isMissing ? missingHint : undefined;
}

function resolveSelection(
  selectedId: string,
  items: readonly { readonly id: string }[],
): { readonly id: string; readonly isMissing: boolean } {
  if (selectedId === "") {
    return { id: "", isMissing: false };
  }
  return items.some((item) => item.id === selectedId)
    ? { id: selectedId, isMissing: false }
    : { id: "", isMissing: true };
}

function transferDestinationHint(
  count: number,
  {
    isMismatchedCurrency = false,
    isMissing,
    isSameAccount,
    kind,
  }: {
    readonly isMismatchedCurrency?: boolean;
    readonly isMissing: boolean;
    readonly isSameAccount: boolean;
    readonly kind: "cash accounts" | "securities accounts";
  },
): string | undefined {
  if (count < 2) {
    return `Add at least two ${kind} first`;
  }
  if (isMissing) {
    return "Selected account is no longer available";
  }
  if (isSameAccount) {
    return "Choose a different destination account";
  }
  return isMismatchedCurrency ? "Transfers must share a currency" : undefined;
}

function transferSourceHint(
  count: number,
  isMissing: boolean,
  kind: "cash accounts" | "securities accounts",
): string | undefined {
  if (count < 2) {
    return `Add at least two ${kind} first`;
  }
  return isMissing ? "Selected account is no longer available" : undefined;
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

function withEmptyPlaceholder(
  options: readonly Option<string>[],
  selectedId: string,
  placeholder: string,
): readonly Option<string>[] {
  return selectedId === "" && options.every((option) => option.value !== "")
    ? [{ label: placeholder, value: "" }, ...options]
    : options;
}
