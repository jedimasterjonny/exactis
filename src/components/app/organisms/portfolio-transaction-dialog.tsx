"use client";

import type { JSX } from "react";

import { useState } from "react";

import type {
  CashAccount,
  EditPortfolioTransaction,
  Holding,
  NewPortfolioTransaction,
  PortfolioTransaction,
  SecuritiesAccount,
  TransactionType,
} from "@/data/portfolio";
import type { Option, OptionGroup } from "@/lib/options";

import {
  addPortfolioTransaction,
  editPortfolioTransaction,
} from "@/actions/portfolio";
import { FieldRow } from "@/components/app/atoms/field-row";
import { Note } from "@/components/app/atoms/note";
import { Caution } from "@/components/app/molecules/caution";
import { DateField } from "@/components/app/molecules/date-field";
import {
  CurrencyField,
  ExchangeRateField,
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
  withSyncNote,
} from "@/data/portfolio";
import { useSender } from "@/hooks/use-sender";
import { formatCurrency, formatGbp, formatPrice } from "@/lib/money";
import { formatDay } from "@/lib/months";

export type PortfolioTransactionDraft = Partial<TransactionFormValues>;

export interface SuggestedCategory {
  readonly name: string;
  readonly securityIds: readonly string[];
}

type AccountsLayout =
  | "cash-and-security"
  | "cash-only"
  | "cash-transfer"
  | "securities-and-cash"
  | "securities-and-currency"
  | "securities-transfer";

interface PortfolioTransactionDialogProps {
  readonly baseCurrency: string;
  readonly cashAccounts: readonly CashAccount[];
  readonly gbpRates?: Readonly<Record<string, number>>;
  readonly handoffAmountGbp?: number;
  readonly holdings: readonly Holding[];
  readonly initialDraft?: PortfolioTransactionDraft;
  readonly onDelete?: (() => void) | undefined;
  readonly onDismiss: () => void;
  readonly onSaved: (draft: NewPortfolioTransaction, version: number) => void;
  readonly securitiesAccounts: readonly SecuritiesAccount[];
  readonly suggestedCategory?: SuggestedCategory;
  readonly today: string;
  readonly transaction?: PortfolioTransaction;
  readonly version: number;
}

interface ResolvedFx {
  readonly amount: null | number;
  readonly error: string | undefined;
  readonly rate: null | number;
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

// The dialog for adding or editing any of Portfolio Performance's fifteen
// transaction types in the household's stored .portfolio file. In edit
// mode the transaction type is locked, any currently-referenced retired
// account or security stays selectable, non-standard delivery currencies
// are preserved, and an existing cross-currency GROSS_VALUE seeds
// fxTypedAmount with fxDriver="amount" so derived rates match
// ExchangeRateField without blur-rounding drift.
export function PortfolioTransactionDialog({
  baseCurrency,
  cashAccounts,
  gbpRates,
  handoffAmountGbp,
  holdings,
  initialDraft,
  onDelete,
  onDismiss,
  onSaved,
  securitiesAccounts,
  suggestedCategory,
  today,
  transaction,
  version,
}: PortfolioTransactionDialogProps): JSX.Element {
  const isEditing = transaction !== undefined;
  const selectableSecurities = securitiesAccounts.filter(
    (account) =>
      !account.isRetired ||
      account.id === transaction?.portfolioId ||
      account.id === transaction?.otherPortfolioId,
  );
  const selectableCash = cashAccounts.filter(
    (account) =>
      !account.isRetired ||
      account.id === transaction?.accountId ||
      account.id === transaction?.otherAccountId,
  );
  const selectableHoldings = holdings
    .filter(
      (holding) => !holding.isRetired || holding.id === transaction?.securityId,
    )
    .toSorted((one, other) => one.name.localeCompare(other.name));

  const initial = initialDialogStateOf({
    baseCurrency,
    handoffAmountGbp,
    initialDraft,
    selectableCash,
    selectableHoldings,
    selectableSecurities,
    today,
    transaction,
  });

  const [type, setType] = useState<TransactionType>(initial.type);
  const [date, setDate] = useState(initial.date);
  const [portfolioId, setPortfolioId] = useState(initial.portfolioId);
  const [otherPortfolioId, setOtherPortfolioId] = useState(
    initial.otherPortfolioId,
  );
  const [accountId, setAccountId] = useState(initial.accountId);
  const [otherAccountId, setOtherAccountId] = useState(initial.otherAccountId);
  const [securityId, setSecurityId] = useState(initial.securityId);
  const [deliveryCurrency, setDeliveryCurrency] = useState(
    initial.deliveryCurrency,
  );
  const [shares, setShares] = useState<null | number>(initial.shares);
  const [amount, setAmount] = useState<null | number>(initial.amount);
  const [activeHandoffAmountGbp, setActiveHandoffAmountGbp] = useState<
    number | undefined
  >(handoffAmountGbp);
  const [hasEditedAmount, setHasEditedAmount] = useState(false);
  const [lastCurrency, setLastCurrency] = useState(initial.currency);
  const [handoffAnnouncement, setHandoffAnnouncement] = useState("");
  const [fees, setFees] = useState<null | number>(initial.fees);
  const [taxes, setTaxes] = useState<null | number>(initial.taxes);
  const [fxPair, setFxPair] = useState(initial.fxPair);
  const [fxDriver, setFxDriver] = useState<"amount" | "rate">("amount");
  const [fxTypedAmount, setFxTypedAmount] = useState<null | number>(
    initial.fxTypedAmount,
  );
  const [fxTypedRate, setFxTypedRate] = useState<null | number>(null);
  const [note, setNote] = useState(initial.note);
  const { isSending, send } = useSender();

  const resolvedPortfolio = resolveSelection(portfolioId, selectableSecurities);
  const resolvedOtherPortfolio = resolveSelection(
    otherPortfolioId,
    selectableSecurities,
  );
  const resolvedAccount = resolveSelection(accountId, selectableCash);
  const resolvedOtherAccount = resolveSelection(otherAccountId, selectableCash);
  const resolvedSecurity = resolveSelection(securityId, selectableHoldings);

  const spec = typeSpecOf(type);
  const hasSecurity = spec.hasShares || spec.accounts === "cash-and-security";
  const fromCash = selectableCash.find(
    (account) => account.id === resolvedAccount.id,
  );
  const toCash = selectableCash.find(
    (account) => account.id === resolvedOtherAccount.id,
  );
  const chosenSecurity = selectableHoldings.find(
    (holding) => holding.id === resolvedSecurity.id,
  );

  const effectiveCurrency = currencyForType(spec.accounts, {
    baseCurrency,
    deliveryCurrency,
    existingCurrency: transaction?.currency,
    fromCashCurrency: fromCash?.currency,
  });

  if (lastCurrency !== effectiveCurrency) {
    setLastCurrency(effectiveCurrency);
    if (activeHandoffAmountGbp !== undefined && !hasEditedAmount) {
      setAmount(effectiveCurrency === "GBP" ? activeHandoffAmountGbp : null);
      setHandoffAnnouncement(
        handoffAnnouncementOf(activeHandoffAmountGbp, effectiveCurrency),
      );
    }
  }

  const fxCurrency = fxCurrencyOf({
    accounts: spec.accounts,
    effectiveCurrency,
    hasCosts: spec.hasCosts,
    securityCurrency: chosenSecurity?.currency,
    toCashCurrency: toCash?.currency,
  });
  const isAutoSterlingPence =
    effectiveCurrency === "GBP" && fxCurrency === "GBX";
  const hasManualFx = fxCurrency !== undefined && !isAutoSterlingPence;
  const fxPairKey = fxPairKeyOf(type, effectiveCurrency, fxCurrency);

  if (fxPair !== fxPairKey) {
    setFxPair(fxPairKey);
    setFxDriver("amount");
    setFxTypedAmount(null);
    setFxTypedRate(null);
  }

  const baseSecuritiesOptions = accountOptionsOf(
    selectableSecurities,
    "No securities accounts",
  );
  const baseCashOptions = cashAccountOptionsOf(selectableCash);
  const baseSecurityOptions = accountOptionsOf(
    selectableHoldings,
    "No securities",
  );
  const deliveryCurrencyOptions = deliveryCurrencyOptionsOf(
    deliveryCurrency,
    transaction?.currency,
  );
  const securitySelectOptions = withEmptyPlaceholder(
    baseSecurityOptions,
    resolvedSecurity.id,
    "Select a security",
  );
  const securityGroups = securityGroupsOf(
    selectableHoldings,
    suggestedCategory,
  );
  const shareSecurityOptions = shareSecurityOptionsOf(
    securityGroups,
    securitySelectOptions,
    resolvedSecurity.id,
  );
  const shareSecurityHint = shareSecurityHintOf({
    hasCategoryMatches: securityGroups !== undefined,
    holdingsCount: selectableHoldings.length,
    isMissing: resolvedSecurity.isMissing,
    selectedSecurityId: resolvedSecurity.id,
    suggestedCategory,
  });

  const {
    amountError,
    canSave,
    feesPence,
    grossSettlementPence,
    resolvedFx,
    taxesPence,
  } = evaluateTransactionForm({
    accountId: resolvedAccount.id,
    activeCashCount: selectableCash.length,
    activeSecuritiesCount: selectableSecurities.length,
    amount,
    date,
    fees,
    fxCurrency,
    fxDriver,
    fxTypedAmount,
    fxTypedRate,
    hasManualFx,
    hasSecurity,
    otherAccountId: resolvedOtherAccount.id,
    otherPortfolioId: resolvedOtherPortfolio.id,
    portfolioId: resolvedPortfolio.id,
    securityId: resolvedSecurity.id,
    shares,
    spec,
    taxes,
    type,
  });

  const typeLabel = transactionTypeLabels[type];
  const title = dialogTitleOf({
    chosenSecurity,
    fromCash,
    hasSecurity,
    hasShares: spec.hasShares,
    isEditing,
    suggestedCategory,
    typeLabel,
  });
  const subjectName =
    (hasSecurity ? chosenSecurity?.name : fromCash?.name) ?? "";

  function changeAmount(next: null | number): void {
    setHasEditedAmount(true);
    setHandoffAnnouncement("");
    setAmount(next);
  }

  function changeFxAmount(next: null | number): void {
    setFxDriver("amount");
    setFxTypedAmount(next);
    setFxTypedRate(null);
  }

  function changeFxRate(next: null | number): void {
    setFxDriver("rate");
    setFxTypedRate(next);
    setFxTypedAmount(null);
  }

  function clearAmount(): void {
    setHasEditedAmount(true);
    setHandoffAnnouncement("");
    setAmount(null);
  }

  function clearFx(): void {
    setFxDriver("amount");
    setFxTypedAmount(null);
    setFxTypedRate(null);
  }

  function selectTradePortfolio(nextPortfolioId: string): void {
    setPortfolioId(nextPortfolioId);
    if (isEditing) {
      return;
    }
    const referenceId = selectableSecurities.find(
      (account) => account.id === nextPortfolioId,
    )?.referenceAccountId;
    if (
      referenceId !== undefined &&
      selectableCash.some((account) => account.id === referenceId)
    ) {
      setAccountId(referenceId);
    }
  }

  function selectType(nextType: TransactionType): void {
    setType(nextType);
    setActiveHandoffAmountGbp(undefined);
    setHasEditedAmount(true);
    setHandoffAnnouncement("");
    setAmount(null);
    setFees(null);
    setTaxes(null);
    setShares(null);
    if (nextType === "cash-transfer") {
      setOtherAccountId(
        distinctOtherCashId(resolvedAccount.id, otherAccountId, selectableCash),
      );
    }
    if (nextType === "security-transfer") {
      setOtherPortfolioId(
        distinctOtherId(
          resolvedPortfolio.id,
          otherPortfolioId,
          selectableSecurities,
        ),
      );
    }
  }

  function save(): void {
    const draft = buildTransactionDraft({
      accountId: resolvedAccount.id,
      amount,
      date,
      effectiveCurrency,
      fees,
      fxAmount: hasManualFx ? resolvedFx.amount : null,
      hasSecurity,
      note,
      otherAccountId: resolvedOtherAccount.id,
      otherPortfolioId: resolvedOtherPortfolio.id,
      portfolioId: resolvedPortfolio.id,
      securityId: resolvedSecurity.id,
      shares,
      spec,
      taxes,
      type,
    });

    if (transaction !== undefined) {
      const editDraft: EditPortfolioTransaction = {
        ...draft,
        id: transaction.id,
      };
      send(async () => editPortfolioTransaction(version, editDraft), {
        failure: "Transaction not saved",
        onAccepted: (result) => {
          onSaved(draft, result.version);
        },
        success: (result) => ({
          description: withSyncNote(
            `${typeLabel} · ${subjectName} · ${formatDay(draft.date)}`,
            result.syncWarning,
          ),
          title: "Transaction saved",
        }),
      });
      return;
    }

    send(async () => addPortfolioTransaction(version, draft), {
      failure: "Transaction not saved",
      onAccepted: (result) => {
        onSaved(draft, result.version);
      },
      success: (result) => ({
        description: withSyncNote(
          `${typeLabel} · ${subjectName} · ${formatDay(draft.date)}`,
          result.syncWarning,
        ),
        title: "Transaction saved",
      }),
    });
  }

  return (
    <EditDialog
      canSave={canSave}
      eyebrow={isEditing ? "Edit transaction" : "New transaction"}
      isSaving={isSending}
      isWide
      onDelete={isEditing ? onDelete : undefined}
      onDismiss={onDismiss}
      onSave={save}
      title={title}
    >
      <FieldRow layout="pair">
        <SelectField<TransactionType>
          groups={transactionTypeGroups}
          hint={isEditing ? "Transaction type cannot be changed" : undefined}
          isDisabled={isEditing}
          label="Type"
          onValueChange={selectType}
          value={type}
        />
        <DateField label="Date" onValueChange={setDate} value={date} />
      </FieldRow>

      <AccountFields
        accountId={resolvedAccount.id}
        cashCount={selectableCash.length}
        cashOptions={baseCashOptions}
        deliveryCurrency={deliveryCurrency}
        deliveryCurrencyOptions={deliveryCurrencyOptions}
        isAccountMissing={resolvedAccount.isMissing}
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
        portfolioUnselectedHint={portfolioUnselectedHintOf(
          initialDraft,
          resolvedPortfolio.id,
        )}
        securitiesCount={selectableSecurities.length}
        securitiesOptions={baseSecuritiesOptions}
        securityCount={selectableHoldings.length}
        securityId={resolvedSecurity.id}
        securityOptions={securitySelectOptions}
      />

      {spec.hasShares && (
        <FieldRow layout="pair">
          <SelectField
            {...(securityGroups !== undefined && { groups: securityGroups })}
            hint={shareSecurityHint}
            isDisabled={selectableHoldings.length === 0}
            label="Security"
            onValueChange={setSecurityId}
            options={shareSecurityOptions}
            value={resolvedSecurity.id}
          />
          <SharesField
            hint={sharesHintOf({
              activeHandoffAmountGbp,
              amount,
              initialDraft,
              shares,
            })}
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

      {activeHandoffAmountGbp !== undefined && (
        <p className="sr-only" role="status">
          {handoffAnnouncement}
        </p>
      )}

      {activeHandoffAmountGbp !== undefined && effectiveCurrency !== "GBP" && (
        <HandoffCurrencyCaution
          amountGbp={activeHandoffAmountGbp}
          currency={effectiveCurrency}
          gbpRates={gbpRates}
          isAmountBlank={amount === null}
        />
      )}

      <AmountAndFxFields
        amount={amount}
        amountError={amountError}
        effectiveCurrency={effectiveCurrency}
        fees={fees}
        feesPence={feesPence}
        fxCurrency={fxCurrency}
        gbpRates={gbpRates}
        grossSettlementPence={grossSettlementPence}
        hasManualFx={hasManualFx}
        isAutoSterlingPence={isAutoSterlingPence}
        onAmountChange={changeAmount}
        onAmountCleared={clearAmount}
        onFeesChange={setFees}
        onFxAmountChange={changeFxAmount}
        onFxCleared={clearFx}
        onFxRateChange={changeFxRate}
        onTaxesChange={setTaxes}
        resolvedFx={resolvedFx}
        spec={spec}
        taxes={taxes}
        taxesPence={taxesPence}
        type={type}
      />

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
  deliveryCurrencyOptions,
  isAccountMissing,
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
  portfolioUnselectedHint,
  securitiesCount,
  securitiesOptions,
  securityCount,
  securityId,
  securityOptions,
}: {
  readonly accountId: string;
  readonly cashCount: number;
  readonly cashOptions: readonly Option<string>[];
  readonly deliveryCurrency: string;
  readonly deliveryCurrencyOptions: readonly Option<string>[];
  readonly isAccountMissing: boolean;
  readonly isOtherAccountMissing: boolean;
  readonly isOtherPortfolioMissing: boolean;
  readonly isPortfolioMissing: boolean;
  readonly isSecurityMissing: boolean;
  readonly layout: AccountsLayout;
  readonly onAccountChange: (id: string) => void;
  readonly onDeliveryCurrencyChange: (currency: string) => void;
  readonly onOtherAccountChange: (id: string) => void;
  readonly onOtherPortfolioChange: (id: string) => void;
  readonly onPortfolioChange: (id: string) => void;
  readonly onSecurityChange: (id: string) => void;
  readonly onTradePortfolioChange: (id: string) => void;
  readonly otherAccountId: string;
  readonly otherPortfolioId: string;
  readonly portfolioId: string;
  readonly portfolioUnselectedHint: string | undefined;
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
            hint={securitiesHint ?? portfolioUnselectedHint}
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
            hint={securitiesHint ?? portfolioUnselectedHint}
            isDisabled={securitiesCount === 0}
            label="Securities account"
            onValueChange={onPortfolioChange}
            options={primaryPortfolioOptions}
            value={portfolioId}
          />
          <SelectField
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
  accounts: readonly {
    readonly id: string;
    readonly isRetired: boolean;
    readonly name: string;
  }[],
  emptyLabel: string,
): readonly Option<string>[] {
  return accounts.length === 0
    ? [{ label: emptyLabel, value: "" }]
    : accounts.map((account) => ({
        label: account.isRetired ? `${account.name} (retired)` : account.name,
        value: account.id,
      }));
}

// Amount, fees, taxes, and cross-currency FX inputs for the active
// transaction type. Syncs Gross value and Exchange rate loop-free on
// cross-currency trades, pairs Amount sent and Amount received on
// cross-currency cash transfers, and prints a calm note for automatic
// GBP <-> GBX pence conversion.
function AmountAndFxFields({
  amount,
  amountError,
  effectiveCurrency,
  fees,
  feesPence,
  fxCurrency,
  gbpRates,
  grossSettlementPence,
  hasManualFx,
  isAutoSterlingPence,
  onAmountChange,
  onAmountCleared,
  onFeesChange,
  onFxAmountChange,
  onFxCleared,
  onFxRateChange,
  onTaxesChange,
  resolvedFx,
  spec,
  taxes,
  taxesPence,
  type,
}: {
  readonly amount: null | number;
  readonly amountError: string | undefined;
  readonly effectiveCurrency: string;
  readonly fees: null | number;
  readonly feesPence: number;
  readonly fxCurrency: string | undefined;
  readonly gbpRates: Readonly<Record<string, number>> | undefined;
  readonly grossSettlementPence: number;
  readonly hasManualFx: boolean;
  readonly isAutoSterlingPence: boolean;
  readonly onAmountChange: (value: null | number) => void;
  readonly onAmountCleared: () => void;
  readonly onFeesChange: (value: null | number) => void;
  readonly onFxAmountChange: (value: null | number) => void;
  readonly onFxCleared: () => void;
  readonly onFxRateChange: (value: null | number) => void;
  readonly onTaxesChange: (value: null | number) => void;
  readonly resolvedFx: ResolvedFx;
  readonly spec: TypeSpec;
  readonly taxes: null | number;
  readonly taxesPence: number;
  readonly type: TransactionType;
}): JSX.Element {
  const knownRate =
    fxCurrency === undefined
      ? undefined
      : crossRateOf(gbpRates, effectiveCurrency, fxCurrency);
  const fxRateHint =
    fxCurrency === undefined
      ? undefined
      : fxRateHintOf({
          effectiveCurrency,
          fxCurrency,
          knownRate,
          resolvedFxRate: resolvedFx.rate,
        });
  const grossSettlementHint =
    feesPence + taxesPence > 0 && grossSettlementPence >= 1
      ? `Gross settlement ${formatCurrency(grossSettlementPence / 100, effectiveCurrency)}`
      : undefined;

  let fields: JSX.Element;
  if (spec.hasCosts) {
    fields = (
      <>
        <FieldRow layout="triple">
          <CurrencyField
            currency={effectiveCurrency}
            error={amountError}
            hint={spec.amountHint}
            key={`${type}-${effectiveCurrency}`}
            label={spec.amountLabel}
            max={maxPortfolioMoney}
            min={0}
            onCleared={onAmountCleared}
            onValueChange={onAmountChange}
            onValueCommitted={onAmountChange}
            value={amount}
          />
          <CurrencyField
            currency={effectiveCurrency}
            key={`fees-${effectiveCurrency}`}
            label="Fees"
            max={maxPortfolioMoney}
            min={0}
            onCleared={() => {
              onFeesChange(null);
            }}
            onValueChange={onFeesChange}
            onValueCommitted={onFeesChange}
            value={fees}
          />
          <CurrencyField
            currency={effectiveCurrency}
            key={`taxes-${effectiveCurrency}`}
            label="Taxes"
            max={maxPortfolioMoney}
            min={0}
            onCleared={() => {
              onTaxesChange(null);
            }}
            onValueChange={onTaxesChange}
            onValueCommitted={onTaxesChange}
            value={taxes}
          />
        </FieldRow>
        {hasManualFx && fxCurrency !== undefined && (
          <FieldRow layout="pair">
            <CurrencyField
              currency={fxCurrency}
              error={resolvedFx.error}
              hint={grossSettlementHint}
              key={`fx-amount-${fxCurrency}`}
              label={`Gross value (${fxCurrency})`}
              max={maxPortfolioMoney}
              min={0}
              onCleared={onFxCleared}
              onValueChange={onFxAmountChange}
              onValueCommitted={onFxAmountChange}
              value={resolvedFx.amount}
            />
            <ExchangeRateField
              hint={fxRateHint}
              key={`fx-rate-${effectiveCurrency}-${fxCurrency}`}
              label={`Exchange rate (${effectiveCurrency} per ${fxCurrency})`}
              max={maxPortfolioMoney}
              min={0}
              onCleared={onFxCleared}
              onValueChange={onFxRateChange}
              onValueCommitted={onFxRateChange}
              value={resolvedFx.rate}
            />
          </FieldRow>
        )}
      </>
    );
  } else if (
    spec.accounts === "cash-transfer" &&
    hasManualFx &&
    fxCurrency !== undefined
  ) {
    fields = (
      <FieldRow layout="pair">
        <CurrencyField
          currency={effectiveCurrency}
          key={`cash-transfer-from-${effectiveCurrency}`}
          label={`Amount sent (${effectiveCurrency})`}
          max={maxPortfolioMoney}
          min={0}
          onCleared={onAmountCleared}
          onValueChange={onAmountChange}
          onValueCommitted={onAmountChange}
          value={amount}
        />
        <CurrencyField
          currency={fxCurrency}
          hint={fxRateHint}
          key={`cash-transfer-to-${fxCurrency}`}
          label={`Amount received (${fxCurrency})`}
          max={maxPortfolioMoney}
          min={0}
          onCleared={onFxCleared}
          onValueChange={onFxAmountChange}
          onValueCommitted={onFxAmountChange}
          value={resolvedFx.amount}
        />
      </FieldRow>
    );
  } else {
    fields = (
      <CurrencyField
        currency={effectiveCurrency}
        hint={spec.amountHint}
        key={`${type}-${effectiveCurrency}`}
        label={spec.amountLabel}
        max={maxPortfolioMoney}
        min={0}
        onCleared={onAmountCleared}
        onValueChange={onAmountChange}
        onValueCommitted={onAmountChange}
        value={amount}
      />
    );
  }

  return (
    <>
      {fields}
      {isAutoSterlingPence && (
        <Note>Converted automatically between GBP and GBX (pence).</Note>
      )}
    </>
  );
}

function amountErrorOf(
  type: TransactionType,
  {
    hasExcessCosts,
    isCrossCurrency,
  }: { readonly hasExcessCosts: boolean; readonly isCrossCurrency: boolean },
): string | undefined {
  if (!hasExcessCosts) {
    return undefined;
  }
  const comparison = isCrossCurrency ? "must be less than" : "cannot exceed";
  return type === "purchase"
    ? `Fees and taxes ${comparison} total paid`
    : `Fees and taxes ${comparison} total value`;
}

function buildTransactionDraft({
  accountId,
  amount,
  date,
  effectiveCurrency,
  fees,
  fxAmount,
  hasSecurity,
  note,
  otherAccountId,
  otherPortfolioId,
  portfolioId,
  securityId,
  shares,
  spec,
  taxes,
  type,
}: {
  readonly accountId: string;
  readonly amount: null | number;
  readonly date: string;
  readonly effectiveCurrency: string;
  readonly fees: null | number;
  readonly fxAmount: null | number;
  readonly hasSecurity: boolean;
  readonly note: string;
  readonly otherAccountId: string;
  readonly otherPortfolioId: string;
  readonly portfolioId: string;
  readonly securityId: string;
  readonly shares: null | number;
  readonly spec: TypeSpec;
  readonly taxes: null | number;
  readonly type: TransactionType;
}): NewPortfolioTransaction {
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

  return {
    ...(hasCash && { accountId }),
    amount: amount ?? 0,
    currency: effectiveCurrency,
    date,
    fees: spec.hasCosts ? (fees ?? 0) : 0,
    ...(fxAmount !== null && { fxAmount }),
    ...(trimmedNote !== "" && { note: trimmedNote }),
    ...(spec.accounts === "cash-transfer" && { otherAccountId }),
    ...(spec.accounts === "securities-transfer" && { otherPortfolioId }),
    ...(hasPortfolio && { portfolioId }),
    ...(hasSecurity && { securityId }),
    shares: spec.hasShares ? resolvedShares : 0,
    taxes: spec.hasCosts ? (taxes ?? 0) : 0,
    type,
  };
}

function cashAccountOptionsOf(
  accounts: readonly CashAccount[],
): readonly Option<string>[] {
  return accounts.length === 0
    ? [{ label: "No cash accounts", value: "" }]
    : accounts.map((account) => ({
        label: account.isRetired
          ? `${account.name} (${account.currency}, retired)`
          : `${account.name} (${account.currency})`,
        value: account.id,
      }));
}

function crossRateOf(
  gbpRates: Readonly<Record<string, number>> | undefined,
  effectiveCurrency: string,
  fxCurrency: string,
): number | undefined {
  const effectiveGbp =
    effectiveCurrency === "GBP" ? 1 : gbpRates?.[effectiveCurrency];
  const foreignGbp = fxCurrency === "GBP" ? 1 : gbpRates?.[fxCurrency];
  return effectiveGbp !== undefined &&
    effectiveGbp > 0 &&
    foreignGbp !== undefined &&
    foreignGbp > 0
    ? foreignGbp / effectiveGbp
    : undefined;
}

function currencyForType(
  layout: AccountsLayout,
  {
    baseCurrency,
    deliveryCurrency,
    existingCurrency,
    fromCashCurrency,
  }: {
    readonly baseCurrency: string;
    readonly deliveryCurrency: string;
    readonly existingCurrency: string | undefined;
    readonly fromCashCurrency: string | undefined;
  },
): string {
  if (layout === "securities-and-currency") {
    return deliveryCurrency;
  }
  if (layout === "securities-transfer") {
    return existingCurrency ?? baseCurrency;
  }
  return fromCashCurrency ?? baseCurrency;
}

function deliveryCurrencyOf(code: string): string {
  return deliveryCurrencies.find((currency) => currency === code) ?? "GBP";
}

function deliveryCurrencyOptionsOf(
  current: string,
  preserved: string | undefined,
): readonly Option<string>[] {
  const codes: string[] = [...deliveryCurrencies];
  for (const extra of [preserved, current]) {
    if (extra !== undefined && !codes.includes(extra)) {
      codes.push(extra);
    }
  }
  return codes.map((code) => ({ label: code, value: code }));
}

function dialogTitleOf({
  chosenSecurity,
  fromCash,
  hasSecurity,
  hasShares,
  isEditing,
  suggestedCategory,
  typeLabel,
}: {
  readonly chosenSecurity: Holding | undefined;
  readonly fromCash: CashAccount | undefined;
  readonly hasSecurity: boolean;
  readonly hasShares: boolean;
  readonly isEditing: boolean;
  readonly suggestedCategory: SuggestedCategory | undefined;
  readonly typeLabel: string;
}): string {
  if (hasSecurity && chosenSecurity !== undefined) {
    return `${typeLabel} · ${chosenSecurity.name}`;
  }
  if (isEditing) {
    return fromCash === undefined
      ? typeLabel
      : `${typeLabel} · ${fromCash.name}`;
  }
  if (hasShares && suggestedCategory !== undefined) {
    return `${typeLabel} · ${suggestedCategory.name}`;
  }
  return `New ${typeLabel.toLowerCase()}`;
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

function evaluateTransactionForm({
  accountId,
  activeCashCount,
  activeSecuritiesCount,
  amount,
  date,
  fees,
  fxCurrency,
  fxDriver,
  fxTypedAmount,
  fxTypedRate,
  hasManualFx,
  hasSecurity,
  otherAccountId,
  otherPortfolioId,
  portfolioId,
  securityId,
  shares,
  spec,
  taxes,
  type,
}: {
  readonly accountId: string;
  readonly activeCashCount: number;
  readonly activeSecuritiesCount: number;
  readonly amount: null | number;
  readonly date: string;
  readonly fees: null | number;
  readonly fxCurrency: string | undefined;
  readonly fxDriver: "amount" | "rate";
  readonly fxTypedAmount: null | number;
  readonly fxTypedRate: null | number;
  readonly hasManualFx: boolean;
  readonly hasSecurity: boolean;
  readonly otherAccountId: string;
  readonly otherPortfolioId: string;
  readonly portfolioId: string;
  readonly securityId: string;
  readonly shares: null | number;
  readonly spec: TypeSpec;
  readonly taxes: null | number;
  readonly type: TransactionType;
}): {
  readonly amountError: string | undefined;
  readonly canSave: boolean;
  readonly feesPence: number;
  readonly grossSettlementPence: number;
  readonly resolvedFx: ResolvedFx;
  readonly taxesPence: number;
} {
  const amountPence = amount === null ? 0 : Math.round(amount * 100);
  const feesPence = spec.hasCosts && fees !== null ? Math.round(fees * 100) : 0;
  const taxesPence =
    spec.hasCosts && taxes !== null ? Math.round(taxes * 100) : 0;
  const sharesScaled = shares === null ? 0 : Math.round(shares * 1e8);
  const isCostsBounded = type === "purchase" || type === "inbound-delivery";
  const isCrossCurrency = fxCurrency !== undefined;
  const hasExcessCosts =
    isCostsBounded &&
    amountPence >= 1 &&
    (isCrossCurrency
      ? feesPence + taxesPence >= amountPence
      : feesPence + taxesPence > amountPence);
  const amountError = amountErrorOf(type, { hasExcessCosts, isCrossCurrency });
  const grossSettlementPence = grossSettlementPenceOf({
    amountPence,
    feesPence,
    hasCosts: spec.hasCosts,
    isCostsBounded,
    taxesPence,
  });
  const resolvedFx = resolvedFxValues({
    fxDriver,
    fxTypedAmount,
    fxTypedRate,
    grossSettlementPence,
  });
  const fxAmountMinor =
    resolvedFx.amount === null ? 0 : Math.round(resolvedFx.amount * 100);
  const isValidFx =
    !hasManualFx ||
    (fxAmountMinor >= 1 && fxAmountMinor <= maxPortfolioMoney * 100);
  const isValidAccounts = hasValidAccounts(spec.accounts, {
    accountId,
    activeCashCount,
    activeSecuritiesCount,
    otherAccountId,
    otherPortfolioId,
    portfolioId,
  });
  const canSave =
    isIsoCalendarDate(date) &&
    isValidAccounts &&
    (spec.isAmountOptional || amountPence >= 1) &&
    (!spec.hasShares || sharesScaled >= 1) &&
    (!hasSecurity || securityId !== "") &&
    isValidFx &&
    !hasExcessCosts;

  return {
    amountError,
    canSave,
    feesPence,
    grossSettlementPence,
    resolvedFx,
    taxesPence,
  };
}

function formatHandoffGbp(amountGbp: number): string {
  return Number.isInteger(amountGbp)
    ? formatGbp(amountGbp)
    : formatCurrency(amountGbp, "GBP");
}

function fxCurrencyOf({
  accounts,
  effectiveCurrency,
  hasCosts,
  securityCurrency,
  toCashCurrency,
}: {
  readonly accounts: AccountsLayout;
  readonly effectiveCurrency: string;
  readonly hasCosts: boolean;
  readonly securityCurrency: string | undefined;
  readonly toCashCurrency: string | undefined;
}): string | undefined {
  if (accounts === "cash-transfer") {
    return toCashCurrency !== undefined && toCashCurrency !== effectiveCurrency
      ? toCashCurrency
      : undefined;
  }
  return hasCosts &&
    securityCurrency !== undefined &&
    securityCurrency !== "" &&
    securityCurrency !== effectiveCurrency
    ? securityCurrency
    : undefined;
}

function fxPairKeyOf(
  type: TransactionType,
  effectiveCurrency: string,
  fxCurrency: string | undefined,
): string {
  return fxCurrency !== undefined &&
    !(effectiveCurrency === "GBP" && fxCurrency === "GBX")
    ? `${type}:${effectiveCurrency}:${fxCurrency}`
    : "";
}

function fxRateHintOf({
  effectiveCurrency,
  fxCurrency,
  knownRate,
  resolvedFxRate,
}: {
  readonly effectiveCurrency: string;
  readonly fxCurrency: string;
  readonly knownRate: number | undefined;
  readonly resolvedFxRate: null | number;
}): string | undefined {
  if (resolvedFxRate !== null && resolvedFxRate > 0) {
    return `1 ${fxCurrency} = ${formatPrice(resolvedFxRate, effectiveCurrency)} (1 ${effectiveCurrency} = ${formatPrice(1 / resolvedFxRate, fxCurrency)})`;
  }
  return knownRate === undefined
    ? undefined
    : `Last known rate: 1 ${fxCurrency} = ${formatPrice(knownRate, effectiveCurrency)}`;
}

function grossSettlementPenceOf({
  amountPence,
  feesPence,
  hasCosts,
  isCostsBounded,
  taxesPence,
}: {
  readonly amountPence: number;
  readonly feesPence: number;
  readonly hasCosts: boolean;
  readonly isCostsBounded: boolean;
  readonly taxesPence: number;
}): number {
  if (isCostsBounded) {
    return Math.max(0, amountPence - feesPence - taxesPence);
  }
  return hasCosts ? amountPence + feesPence + taxesPence : amountPence;
}

function handoffAnnouncementOf(amountGbp: number, currency: string): string {
  if (currency === "GBP") {
    return `Amount restored to ${formatHandoffGbp(amountGbp)} for GBP account`;
  }
  return `Amount cleared because this account settles in ${currency}`;
}

// Warns when a GBP Cogitator trade lands on a non-GBP cash account so
// the user enters the executed foreign settlement amount intentionally.
function HandoffCurrencyCaution({
  amountGbp,
  currency,
  gbpRates,
  isAmountBlank,
}: {
  readonly amountGbp: number;
  readonly currency: string;
  readonly gbpRates: Readonly<Record<string, number>> | undefined;
  readonly isAmountBlank: boolean;
}): JSX.Element {
  const gbpPerForeign = gbpRates?.[currency];
  const estimatedForeign =
    gbpPerForeign !== undefined && gbpPerForeign > 0
      ? amountGbp / gbpPerForeign
      : undefined;
  const estimate =
    estimatedForeign === undefined
      ? ""
      : ` (about ${formatCurrency(estimatedForeign, currency)} at the last known rate)`;
  const prompt = isAmountBlank
    ? `This account settles in ${currency}, so the amount was left blank. Enter the executed ${currency} total${estimate}.`
    : `This account settles in ${currency}. Confirm the executed ${currency} total${estimate}.`;
  return (
    <Caution title={`Cogitator trade is ${formatHandoffGbp(amountGbp)}`}>
      {prompt}
    </Caution>
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

function initialAmountOf(
  handoffAmountGbp: number | undefined,
  initialCurrency: string,
  draftAmount: number | undefined,
): null | number {
  if (handoffAmountGbp !== undefined) {
    return initialCurrency === "GBP" ? handoffAmountGbp : null;
  }
  return draftAmount ?? null;
}

function initialDialogStateOf({
  baseCurrency,
  handoffAmountGbp,
  initialDraft,
  selectableCash,
  selectableHoldings,
  selectableSecurities,
  today,
  transaction,
}: {
  readonly baseCurrency: string;
  readonly handoffAmountGbp: number | undefined;
  readonly initialDraft: PortfolioTransactionDraft | undefined;
  readonly selectableCash: readonly CashAccount[];
  readonly selectableHoldings: readonly Holding[];
  readonly selectableSecurities: readonly SecuritiesAccount[];
  readonly today: string;
  readonly transaction: PortfolioTransaction | undefined;
}): {
  readonly accountId: string;
  readonly amount: null | number;
  readonly currency: string;
  readonly date: string;
  readonly deliveryCurrency: string;
  readonly fees: null | number;
  readonly fxPair: string;
  readonly fxTypedAmount: null | number;
  readonly note: string;
  readonly otherAccountId: string;
  readonly otherPortfolioId: string;
  readonly portfolioId: string;
  readonly securityId: string;
  readonly shares: null | number;
  readonly taxes: null | number;
  readonly type: TransactionType;
} {
  const defaults =
    transaction !== undefined
      ? {
          accountId: transaction.accountId ?? "",
          otherAccountId: transaction.otherAccountId ?? "",
          otherPortfolioId: transaction.otherPortfolioId ?? "",
          portfolioId: transaction.portfolioId ?? "",
          securityId: transaction.securityId ?? "",
        }
      : initialSelectionOf({
          activeCash: selectableCash,
          activeSecurities: selectableSecurities,
          initialDraft,
          sortedHoldings: selectableHoldings,
        });
  const type = transaction?.type ?? initialDraft?.type ?? "purchase";
  const deliveryCurrency =
    transaction !== undefined
      ? transaction.currency
      : deliveryCurrencyOf(initialDraft?.currency ?? baseCurrency);
  const spec = typeSpecOf(type);
  const currency = currencyForType(spec.accounts, {
    baseCurrency,
    deliveryCurrency,
    existingCurrency: transaction?.currency,
    fromCashCurrency: selectableCash.find(
      (account) => account.id === defaults.accountId,
    )?.currency,
  });
  const fxCurrency = fxCurrencyOf({
    accounts: spec.accounts,
    effectiveCurrency: currency,
    hasCosts: spec.hasCosts,
    securityCurrency: selectableHoldings.find(
      (holding) => holding.id === defaults.securityId,
    )?.currency,
    toCashCurrency: selectableCash.find(
      (account) => account.id === defaults.otherAccountId,
    )?.currency,
  });
  const fxPair = fxPairKeyOf(type, currency, fxCurrency);
  const fxTypedAmount =
    transaction?.grossValue !== undefined &&
    fxPair !== "" &&
    transaction.grossValue.currency === currency &&
    transaction.grossValue.fxCurrency === fxCurrency
      ? transaction.grossValue.fxAmount
      : null;

  return {
    accountId: defaults.accountId,
    amount:
      transaction !== undefined
        ? positiveOrNull(transaction.amount)
        : initialAmountOf(handoffAmountGbp, currency, initialDraft?.amount),
    currency,
    date: transaction?.date ?? initialDraft?.date ?? today,
    deliveryCurrency,
    fees:
      transaction !== undefined
        ? positiveOrNull(transaction.fees)
        : (initialDraft?.fees ?? null),
    fxPair,
    fxTypedAmount,
    note: transaction?.note ?? initialDraft?.note ?? "",
    otherAccountId: defaults.otherAccountId,
    otherPortfolioId: defaults.otherPortfolioId,
    portfolioId: defaults.portfolioId,
    securityId: defaults.securityId,
    shares:
      transaction !== undefined
        ? positiveOrNull(transaction.shares)
        : (initialDraft?.shares ?? null),
    taxes:
      transaction !== undefined
        ? positiveOrNull(transaction.taxes)
        : (initialDraft?.taxes ?? null),
    type,
  };
}

function initialSelectionOf({
  activeCash,
  activeSecurities,
  initialDraft,
  sortedHoldings,
}: {
  readonly activeCash: readonly CashAccount[];
  readonly activeSecurities: readonly SecuritiesAccount[];
  readonly initialDraft: PortfolioTransactionDraft | undefined;
  readonly sortedHoldings: readonly Holding[];
}): {
  readonly accountId: string;
  readonly otherAccountId: string;
  readonly otherPortfolioId: string;
  readonly portfolioId: string;
  readonly securityId: string;
} {
  const portfolioId =
    initialDraft?.portfolioId === ""
      ? ""
      : (validOptionId(initialDraft?.portfolioId, activeSecurities) ??
        activeSecurities[0]?.id ??
        "");
  const otherPortfolioId =
    validOptionId(initialDraft?.otherPortfolioId, activeSecurities) ??
    activeSecurities.find((account) => account.id !== portfolioId)?.id ??
    "";
  const referenceCashId = activeSecurities.find(
    (account) => account.id === portfolioId,
  )?.referenceAccountId;
  const defaultCashId =
    initialDraft?.portfolioId === "" && activeCash.length !== 1
      ? ""
      : (activeCash[0]?.id ?? "");
  const accountId =
    validOptionId(initialDraft?.accountId, activeCash) ??
    validOptionId(referenceCashId, activeCash) ??
    defaultCashId;
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
    initialDraft?.securityId === ""
      ? ""
      : (validOptionId(initialDraft?.securityId, sortedHoldings) ??
        sortedHoldings[0]?.id ??
        "");
  return {
    accountId,
    otherAccountId,
    otherPortfolioId,
    portfolioId,
    securityId,
  };
}

function portfolioUnselectedHintOf(
  initialDraft: PortfolioTransactionDraft | undefined,
  selectedPortfolioId: string,
): string | undefined {
  return initialDraft?.portfolioId === "" && selectedPortfolioId === ""
    ? "Choose the account for this trade"
    : undefined;
}

function positiveOrNull(value: number): null | number {
  return value > 0 ? value : null;
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

// Computes the synced Gross value and Exchange rate pair loop-free:
// when driving from Gross value, rounds the derived rate to 6 d.p.
// matching ExchangeRateField so tabbing past the rate field without
// editing never triggers Base UI blur-rounding to flip fxDriver.
function resolvedFxValues({
  fxDriver,
  fxTypedAmount,
  fxTypedRate,
  grossSettlementPence,
}: {
  readonly fxDriver: "amount" | "rate";
  readonly fxTypedAmount: null | number;
  readonly fxTypedRate: null | number;
  readonly grossSettlementPence: number;
}): ResolvedFx {
  if (fxDriver === "rate") {
    if (grossSettlementPence < 1 || fxTypedRate === null || fxTypedRate <= 0) {
      return { amount: null, error: undefined, rate: fxTypedRate };
    }
    const derived = Math.round(grossSettlementPence / fxTypedRate) / 100;
    const isInRange = derived >= 0.01 && derived <= maxPortfolioMoney;
    return {
      amount: isInRange ? derived : null,
      error: isInRange
        ? undefined
        : "Exchange rate produces an out-of-range amount",
      rate: fxTypedRate,
    };
  }
  const fxMinor = fxTypedAmount === null ? 0 : Math.round(fxTypedAmount * 100);
  const roundedRate =
    grossSettlementPence >= 1 && fxMinor >= 1
      ? Math.round((grossSettlementPence / fxMinor) * 1e6) / 1e6
      : null;
  return {
    amount: fxTypedAmount,
    error: undefined,
    rate:
      roundedRate !== null &&
      roundedRate > 0 &&
      roundedRate <= maxPortfolioMoney
        ? roundedRate
        : null,
  };
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

function securityGroupsOf(
  sortedHoldings: readonly Holding[],
  suggestedCategory: SuggestedCategory | undefined,
): readonly OptionGroup[] | undefined {
  if (suggestedCategory === undefined) {
    return undefined;
  }
  const suggestedIds = new Set(suggestedCategory.securityIds);
  const inCategoryOptions: Option<string>[] = [];
  const otherSecurityOptions: Option<string>[] = [];
  for (const holding of sortedHoldings) {
    const option = { label: holding.name, value: holding.id };
    if (suggestedIds.has(holding.id)) {
      inCategoryOptions.push(option);
    } else {
      otherSecurityOptions.push(option);
    }
  }
  if (inCategoryOptions.length === 0) {
    return undefined;
  }
  const otherGroupLabel =
    suggestedCategory.name === "Other securities"
      ? "Other"
      : "Other securities";
  return [
    { label: suggestedCategory.name, options: inCategoryOptions },
    ...(otherSecurityOptions.length > 0
      ? [{ label: otherGroupLabel, options: otherSecurityOptions }]
      : []),
  ];
}

function shareSecurityHintOf({
  hasCategoryMatches,
  holdingsCount,
  isMissing,
  selectedSecurityId,
  suggestedCategory,
}: {
  readonly hasCategoryMatches: boolean;
  readonly holdingsCount: number;
  readonly isMissing: boolean;
  readonly selectedSecurityId: string;
  readonly suggestedCategory: SuggestedCategory | undefined;
}): string | undefined {
  const requiredHint = requiredSelectHint(holdingsCount, {
    emptyHint: "Add a security first",
    isMissing,
    missingHint: "Selected security is no longer available",
  });
  if (requiredHint !== undefined) {
    return requiredHint;
  }
  if (suggestedCategory !== undefined && selectedSecurityId === "") {
    return hasCategoryMatches
      ? `Choose a security in ${suggestedCategory.name}`
      : `No active security assigned to ${suggestedCategory.name}`;
  }
  return undefined;
}

function shareSecurityOptionsOf(
  securityGroups: readonly OptionGroup[] | undefined,
  securitySelectOptions: readonly Option<string>[],
  selectedSecurityId: string,
): readonly Option<string>[] {
  if (securityGroups === undefined) {
    return securitySelectOptions;
  }
  return selectedSecurityId === ""
    ? [{ label: "Select a security", value: "" }]
    : [];
}

function sharesHintOf({
  activeHandoffAmountGbp,
  amount,
  initialDraft,
  shares,
}: {
  readonly activeHandoffAmountGbp: number | undefined;
  readonly amount: null | number;
  readonly initialDraft: PortfolioTransactionDraft | undefined;
  readonly shares: null | number;
}): string | undefined {
  if (shares !== null) {
    return undefined;
  }
  const hasHandoffAmount =
    activeHandoffAmountGbp !== undefined ||
    (initialDraft?.amount !== undefined && amount !== null);
  return hasHandoffAmount ? "Enter executed shares" : undefined;
}

function transferDestinationHint(
  count: number,
  {
    isMissing,
    isSameAccount,
    kind,
  }: {
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
  return isSameAccount ? "Choose a different destination account" : undefined;
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
