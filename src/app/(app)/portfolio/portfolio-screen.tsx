"use client";

import type { Route } from "next";
import type { JSX } from "react";

import { Briefcase, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type {
  AccountKind,
  EditingPortfolioAccount,
} from "@/components/app/organisms/portfolio-account-dialog";
import type {
  PortfolioTransactionDraft,
  SuggestedCategory,
} from "@/components/app/organisms/portfolio-transaction-dialog";
import type {
  CashAccount,
  Holding,
  NewPortfolioTransaction,
  PortfolioSnapshot,
  PortfolioTransaction,
  SecuritiesAccount,
  TransactionType,
} from "@/data/portfolio";
import type { OwnedPortfolio } from "@/store/portfolio";

import {
  deletePortfolioAccount,
  deletePortfolioSecurity,
  deletePortfolioTransaction,
} from "@/actions/portfolio";
import { PortfolioSummary } from "@/components/app/atoms/portfolio-summary";
import { Caution } from "@/components/app/molecules/caution";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { ScreenTabs } from "@/components/app/molecules/screen-tabs";
import { PortfolioAccountDialog } from "@/components/app/organisms/portfolio-account-dialog";
import { PortfolioAccounts } from "@/components/app/organisms/portfolio-accounts";
import { PortfolioHoldings } from "@/components/app/organisms/portfolio-holdings";
import { PortfolioQuotesDialog } from "@/components/app/organisms/portfolio-quotes-dialog";
import { PortfolioSecurityDialog } from "@/components/app/organisms/portfolio-security-dialog";
import { PortfolioTransactionDialog } from "@/components/app/organisms/portfolio-transaction-dialog";
import { PortfolioTransactions } from "@/components/app/organisms/portfolio-transactions";
import { PortfolioUpload } from "@/components/app/organisms/portfolio-upload";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Screen } from "@/components/app/templates/screen";
import { buttonVariants } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import { transactionTypeLabels, withSyncNote } from "@/data/portfolio";
import { useSender } from "@/hooks/use-sender";
import { counted } from "@/lib/count";
import { formatGbp } from "@/lib/money";
import { formatDay } from "@/lib/months";
import { portfolio, sectionLabel, subsectionLabel } from "@/lib/nav";

export interface PortfolioTradeHandoff {
  readonly amount?: number;
  readonly categoryId?: string;
  readonly portfolioId?: string;
  readonly securityId?: string;
  readonly type: "purchase" | "sale";
}

interface DeleteTarget {
  readonly cancelFocusIds?: readonly string[];
  readonly fallbackFocusIds: readonly string[];
  readonly id: string;
  readonly kind: "cash" | "securities" | "security" | "transaction";
  readonly name: string;
  readonly title: string;
}

interface OpeningSecurityHandoff {
  readonly afterVersion: number;
  readonly portfolioId?: string;
  readonly securityId: string;
}

interface OwnedPortfolioTabsProps {
  readonly activeTab: PortfolioTab;
  readonly initialTrade?: PortfolioTradeHandoff;
  readonly isInScenario: boolean;
  readonly onActiveTabChange: (tab: PortfolioTab) => void;
  readonly onInitialTradeClosed: () => void;
  readonly scenarioNoteId: string;
  readonly snapshot: PortfolioSnapshot;
  readonly today: string;
  readonly version: number;
}

interface PendingFocus {
  readonly afterVersion: number;
  readonly tab: PortfolioTab;
  readonly targets: readonly string[];
}

interface PortfolioScreenProps {
  readonly initialTab?: string | undefined;
  readonly initialTrade?: PortfolioTradeHandoff;
  readonly isInScenario: boolean;
  readonly owned: null | OwnedPortfolio;
  readonly today: string;
}

type PortfolioTab = "Accounts" | "Holdings" | "Transactions";

interface ResolvedHandoff {
  readonly amountGbp?: number;
  readonly draft: PortfolioTransactionDraft;
  readonly suggestedCategory?: SuggestedCategory;
}

// The Portfolio screen backed by the household's versioned binary
// Portfolio Performance (.portfolio) file stored in Postgres. Before a
// file is uploaded it renders a single primary upload CTA (locked while
// a scenario is open). Once stored it renders the server-parsed
// snapshot with Download .portfolio and confirm-guarded Replace file…
// actions in the header, moves focus to h1 on the empty-to-owned
// transition so focus never drops to document.body, and keys the
// tabs/filters subtree on replaceCount and fileName so single-entry
// write-backs preserve filters and open stale-refresh dialogs while
// whole-file replacements reset view state cleanly.
export function PortfolioScreen({
  initialTab,
  initialTrade,
  isInScenario,
  owned,
  today,
}: PortfolioScreenProps): JSX.Element {
  const router = useRouter();
  const [replaceCount, setReplaceCount] = useState(0);
  const [activeTab, setActiveTab] = useState<PortfolioTab>(() =>
    initialTabOf(initialTab, owned !== null ? initialTrade : undefined),
  );
  const [canOpenInitialTrade, setCanOpenInitialTrade] = useState(
    () => owned !== null && !isInScenario && initialTrade !== undefined,
  );
  const scenarioNoteId = useId();
  const hasOwned = owned !== null;
  const wasEmptyRef = useRef(!hasOwned);
  const suppressedTradeUrlRef = useRef<null | Route>(
    suppressedTradeUrlOf(owned, isInScenario, initialTrade),
  );

  if (canOpenInitialTrade && isInScenario) {
    setCanOpenInitialTrade(false);
  }

  useEffect(() => {
    const target = suppressedTradeUrlRef.current;
    if (target !== null) {
      suppressedTradeUrlRef.current = null;
      router.replace(target, { scroll: false });
    }
  }, [router]);

  useEffect(() => {
    if (wasEmptyRef.current && hasOwned) {
      document.querySelector<HTMLElement>("h1")?.focus();
    }
    wasEmptyRef.current = !hasOwned;
  }, [hasOwned]);

  if (owned === null) {
    return (
      <Screen
        label={sectionLabel(portfolio)}
        meta="No file uploaded"
        title={portfolio.title}
      >
        {isInScenario && (
          <Caution
            id={scenarioNoteId}
            title="Portfolio belongs to the household"
          >
            Leave the scenario to upload a portfolio file.
          </Caution>
        )}
        <SectionCardUpload
          describedBy={isInScenario ? scenarioNoteId : undefined}
          isDisabled={isInScenario}
        />
      </Screen>
    );
  }

  const { savedOn, snapshot, version } = owned;
  const snapshotActiveSecurities = snapshot.securitiesAccounts.filter(
    (account) => !account.isRetired,
  );
  const snapshotActiveCash = snapshot.cashAccounts.filter(
    (account) => !account.isRetired,
  );
  const snapshotActiveHoldingsCount = snapshot.holdings.filter(
    (holding) => holding.shares > 0,
  ).length;

  const activeInitialTrade = canOpenInitialTrade ? initialTrade : undefined;

  return (
    <Screen
      actions={
        <>
          {/* Plain link omitting the download attribute: the route sends
              Content-Disposition: attachment so a signed-in click saves the
              file, while an expired session's 307 to /login navigates to
              the sign-in screen instead of saving login HTML. */}
          <a
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href="/portfolio/download"
          >
            <Download aria-hidden />
            Download .portfolio
          </a>
          <PortfolioUpload
            currentFileName={snapshot.fileName}
            describedBy={isInScenario ? scenarioNoteId : undefined}
            isDisabled={isInScenario}
            onReplaced={() => {
              setCanOpenInitialTrade(false);
              setReplaceCount((count) => count + 1);
            }}
            version={version}
          />
        </>
      }
      label={sectionLabel(portfolio)}
      meta={
        <span className="min-w-0 wrap-anywhere">
          {`${snapshot.fileName} · ${snapshot.baseCurrency} · Saved ${formatDay(savedOn)}`}
        </span>
      }
      title={portfolio.title}
    >
      {isInScenario && (
        <Caution id={scenarioNoteId} title="Portfolio belongs to the household">
          Leave the scenario to replace the file or update the portfolio.
        </Caution>
      )}
      {snapshot.baseCurrency !== "GBP" && (
        <Caution title={`Base currency is ${snapshot.baseCurrency}`}>
          Totals below are shown in GBP where an exchange rate is known.
        </Caution>
      )}
      <h2 className="heading text-2xl text-balance tabular-nums">
        {`The portfolio holds ${formatGbp(snapshot.totalInvested + snapshot.totalCash)} across ${counted(snapshotActiveSecurities.length, "securities account")} and ${counted(snapshotActiveCash.length, "cash account")}, with ${formatGbp(snapshot.totalCash)} uninvested.`}
      </h2>
      <PortfolioSummary
        holdingsCount={snapshotActiveHoldingsCount}
        latestQuoteDate={snapshot.latestQuoteDate}
        today={today}
        totalCash={snapshot.totalCash}
        totalInvested={snapshot.totalInvested}
      />
      <OwnedPortfolioTabs
        activeTab={activeTab}
        isInScenario={isInScenario}
        key={`${String(replaceCount)}:${snapshot.fileName}`}
        onActiveTabChange={setActiveTab}
        onInitialTradeClosed={() => {
          setCanOpenInitialTrade(false);
        }}
        scenarioNoteId={scenarioNoteId}
        snapshot={snapshot}
        today={today}
        version={version}
        {...(activeInitialTrade !== undefined && {
          initialTrade: activeInitialTrade,
        })}
      />
    </Screen>
  );
}

function canOpenSecurityTrade(
  securityId: string,
  activeSecurities: readonly SecuritiesAccount[],
  holdings: readonly Holding[],
): boolean {
  return (
    activeSecurities.length > 0 &&
    holdings.some((holding) => holding.id === securityId && !holding.isRetired)
  );
}

function deleteCopyOf(target: DeleteTarget): {
  readonly confirmBody: string;
  readonly failure: string;
  readonly successBody: string;
  readonly successTitle: string;
} {
  switch (target.kind) {
    case "cash":
    case "securities":
      return {
        confirmBody: `Removes ${target.name} from the portfolio file. It cannot be brought back.`,
        failure: "Account not deleted",
        successBody: `${target.name} removed from the portfolio file`,
        successTitle: "Account deleted",
      };
    case "security":
      return {
        confirmBody: `Removes ${target.name} from the catalogue. It cannot be brought back.`,
        failure: "Security not deleted",
        successBody: `${target.name} removed from the catalogue`,
        successTitle: "Security deleted",
      };
    case "transaction":
      return {
        confirmBody: `Removes ${target.name} from the portfolio file. It cannot be brought back.`,
        failure: "Transaction not deleted",
        successBody: `${target.name} removed from the portfolio file`,
        successTitle: "Transaction deleted",
      };
  }
}

// The starting tab from an optional ?tab= query parameter or trade handoff.
function initialTabOf(
  tab: string | undefined,
  initialTrade: PortfolioTradeHandoff | undefined,
): PortfolioTab {
  if (initialTrade !== undefined) {
    return "Transactions";
  }
  const normalized = tab?.toLowerCase();
  if (normalized === "accounts") {
    return "Accounts";
  }
  return normalized === "transactions" ? "Transactions" : "Holdings";
}

function isElementVisible(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current !== null) {
    const style = globalThis.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      current.hasAttribute("inert")
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function isOpeningHandoffStale(
  handoff: null | OpeningSecurityHandoff,
  context: {
    readonly activeSecurities: readonly SecuritiesAccount[];
    readonly activeTab: PortfolioTab;
    readonly holdings: readonly Holding[];
    readonly isOtherOverlayOpen: boolean;
    readonly version: number;
  },
): boolean {
  if (handoff === null) {
    return false;
  }
  if (context.activeTab !== "Holdings" || context.isOtherOverlayOpen) {
    return true;
  }
  return (
    context.version >= handoff.afterVersion &&
    !canOpenSecurityTrade(
      handoff.securityId,
      context.activeSecurities,
      context.holdings,
    )
  );
}

function openingTradeDraftOf(
  target: OpeningSecurityHandoff,
  activeSecurities: readonly SecuritiesAccount[],
  activeCash: readonly CashAccount[],
): PortfolioTransactionDraft {
  const portfolioId = resolveTradePortfolioId(
    target.portfolioId,
    activeSecurities,
  );
  return {
    ...(portfolioId !== undefined && { portfolioId }),
    securityId: target.securityId,
    type: activeCash.length > 0 ? "purchase" : "inbound-delivery",
  };
}

// Tabs, filters, switches, and write-back dialogs for the owned
// portfolio file. Keyed on replaceCount and fileName so single-entry
// mutations preserve filters and keep dialogs open across stale
// refreshes, while whole-file replacements reset cleanly.
function OwnedPortfolioTabs({
  activeTab,
  initialTrade,
  isInScenario,
  onActiveTabChange,
  onInitialTradeClosed,
  scenarioNoteId,
  snapshot,
  today,
  version,
}: OwnedPortfolioTabsProps): JSX.Element {
  const router = useRouter();
  const [holdingsAccountId, setHoldingsAccountId] = useState("");
  const [isShowingZeroShares, setIsShowingZeroShares] = useState(false);
  const [transactionsAccountId, setTransactionsAccountId] = useState("");
  const [transactionsType, setTransactionsType] = useState<
    "" | TransactionType
  >("");
  const [transactionsSecurityId, setTransactionsSecurityId] = useState("");
  const [isShowingInactiveTransactions, setIsShowingInactiveTransactions] =
    useState(false);
  const [addingAccount, setAddingAccount] = useState<AccountKind | null>(null);
  const [editingAccount, setEditingAccount] =
    useState<EditingPortfolioAccount | null>(null);
  const [isAddingSecurity, setIsAddingSecurity] = useState(false);
  const [editingSecurity, setEditingSecurity] = useState<Holding | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<null | PortfolioTransaction>(null);
  const [handoff, setHandoff] = useState<null | ResolvedHandoff>(() =>
    initialTrade !== undefined
      ? resolveTradeHandoff(initialTrade, snapshot)
      : null,
  );
  const [isUpdatingQuotes, setIsUpdatingQuotes] = useState(false);
  const [openingSecurityHandoff, setOpeningSecurityHandoff] =
    useState<null | OpeningSecurityHandoff>(null);
  const [isScenarioOpen, setIsScenarioOpen] = useState(isInScenario);
  const isHandoffOpen = handoff !== null;
  const wasHandoffOpenRef = useRef(isHandoffOpen);
  const editFallbackFocusRef = useRef<readonly string[]>([]);
  const pendingFocusRef = useRef<null | PendingFocus>(null);
  const { isSending: isDeleting, send: sendDelete } = useSender();

  useEffect(() => {
    if (wasHandoffOpenRef.current && !isHandoffOpen) {
      document.querySelector<HTMLElement>("h1")?.focus();
      router.replace(`${portfolio.href}?tab=transactions`, { scroll: false });
    }
    wasHandoffOpenRef.current = isHandoffOpen;
  }, [isHandoffOpen, router]);

  const activeSecurities = snapshot.securitiesAccounts.filter(
    (account) => !account.isRetired,
  );
  const activeCash = snapshot.cashAccounts.filter(
    (account) => !account.isRetired,
  );
  const isOtherOverlayOpen =
    addingAccount !== null ||
    deleting !== null ||
    editingAccount !== null ||
    editingSecurity !== null ||
    editingTransaction !== null ||
    handoff !== null ||
    isAddingSecurity ||
    isAddingTransaction ||
    isUpdatingQuotes;
  const isOpeningHandoffInvalid = isOpeningHandoffStale(
    openingSecurityHandoff,
    {
      activeSecurities,
      activeTab,
      holdings: snapshot.holdings,
      isOtherOverlayOpen,
      version,
    },
  );
  if (isOpeningHandoffInvalid) {
    setOpeningSecurityHandoff(null);
  }
  const isOpeningSecurityReady =
    openingSecurityHandoff !== null &&
    !isOpeningHandoffInvalid &&
    version >= openingSecurityHandoff.afterVersion;
  const isOverlayOpen = isOtherOverlayOpen || isOpeningSecurityReady;

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) {
      return;
    }
    if (isInScenario || pending.tab !== activeTab) {
      pendingFocusRef.current = null;
      return;
    }
    if (isOverlayOpen || version < pending.afterVersion) {
      return;
    }
    pendingFocusRef.current = null;
    let isCancelled = false;
    // Queue strictly after Base UI FloatingFocusManager's unmount microtask
    // so same-commit refreshes do not have restored focus overwritten.
    queueMicrotask(() => {
      if (!isCancelled) {
        restoreRowFocus(pending.targets);
      }
    });
    return (): void => {
      isCancelled = true;
    };
  }, [activeTab, isInScenario, isOverlayOpen, snapshot, version]);

  if (isScenarioOpen !== isInScenario) {
    setIsScenarioOpen(isInScenario);
    if (isInScenario) {
      setAddingAccount(null);
      setDeleting(null);
      setEditingAccount(null);
      setEditingSecurity(null);
      setEditingTransaction(null);
      setHandoff(null);
      setIsAddingSecurity(false);
      setIsAddingTransaction(false);
      setIsUpdatingQuotes(false);
      setOpeningSecurityHandoff(null);
    }
  }

  function closeTransactionDialog(): void {
    if (handoff !== null) {
      setHandoff(null);
      onInitialTradeClosed();
    }
    setIsAddingTransaction(false);
  }

  function confirmDelete(target: DeleteTarget): void {
    const copy = deleteCopyOf(target);
    sendDelete(
      async () => {
        switch (target.kind) {
          case "cash":
          case "securities":
            return deletePortfolioAccount(version, {
              id: target.id,
              kind: target.kind,
            });
          case "security":
            return deletePortfolioSecurity(version, { id: target.id });
          case "transaction":
            return deletePortfolioTransaction(version, { id: target.id });
        }
      },
      {
        failure: copy.failure,
        onAccepted: (result) => {
          pendingFocusRef.current = {
            afterVersion: result.version,
            tab: activeTab,
            targets: target.fallbackFocusIds,
          };
          setDeleting(null);
        },
        success: (result) => ({
          description: withSyncNote(copy.successBody, result.syncWarning),
          title: copy.successTitle,
        }),
      },
    );
  }

  function handleAccountAdded(): void {
    setAddingAccount(null);
  }

  function handleAccountEdited(
    target: EditingPortfolioAccount,
    outcome: { readonly isRetired: boolean; readonly version: number },
  ): void {
    if (!target.account.isRetired && outcome.isRetired) {
      pendingFocusRef.current = {
        afterVersion: outcome.version,
        tab: activeTab,
        targets: [
          `${target.kind}:${target.account.id}`,
          ...editFallbackFocusRef.current,
        ],
      };
    }
    setEditingAccount(null);
  }

  function handleSecurityAdded(outcome: {
    readonly id: string;
    readonly isRetired: boolean;
    readonly shouldRecordOpening: boolean;
    readonly version: number;
  }): void {
    const requestedPortfolioId =
      holdingsAccountId === "" ? undefined : holdingsAccountId;
    setHoldingsAccountId("");
    setIsShowingZeroShares(true);
    setIsAddingSecurity(false);
    if (outcome.shouldRecordOpening) {
      setOpeningSecurityHandoff({
        afterVersion: outcome.version,
        ...(requestedPortfolioId !== undefined && {
          portfolioId: requestedPortfolioId,
        }),
        securityId: outcome.id,
      });
    } else {
      pendingFocusRef.current = {
        afterVersion: outcome.version,
        tab: activeTab,
        targets: [`holding:${outcome.id}`],
      };
    }
  }

  function handleSecurityEdited(
    target: Holding,
    outcome: { readonly isRetired: boolean; readonly version: number },
  ): void {
    if (!target.isRetired && outcome.isRetired) {
      pendingFocusRef.current = {
        afterVersion: outcome.version,
        tab: activeTab,
        targets: [`holding:${target.id}`, ...editFallbackFocusRef.current],
      };
    }
    setEditingSecurity(null);
  }

  function openAccountEditor(
    target: EditingPortfolioAccount,
    fallbackFocusIds: readonly string[],
  ): void {
    editFallbackFocusRef.current = fallbackFocusIds;
    setEditingAccount(target);
  }

  function openCashEditor(
    account: CashAccount,
    fallbackFocusIds: readonly string[],
  ): void {
    openAccountEditor({ account, kind: "cash" }, fallbackFocusIds);
  }

  function openSecuritiesEditor(
    account: SecuritiesAccount,
    fallbackFocusIds: readonly string[],
  ): void {
    openAccountEditor({ account, kind: "securities" }, fallbackFocusIds);
  }

  function openSecurityEditor(
    holding: Holding,
    fallbackFocusIds: readonly string[],
  ): void {
    editFallbackFocusRef.current = fallbackFocusIds;
    setEditingSecurity(holding);
  }

  function openTransactionEditor(
    transaction: PortfolioTransaction,
    fallbackFocusIds: readonly string[],
  ): void {
    editFallbackFocusRef.current = fallbackFocusIds;
    setEditingTransaction(transaction);
  }

  function requestSecurityDelete(
    holding: Holding,
    fallbackFocusIds: readonly string[],
  ): void {
    setDeleting({
      fallbackFocusIds,
      id: holding.id,
      kind: "security",
      name: holding.name,
      title: holding.name,
    });
  }

  function requestTransactionDelete(
    transaction: PortfolioTransaction,
    fallbackFocusIds: readonly string[],
  ): void {
    setDeleting({
      fallbackFocusIds,
      id: transaction.id,
      kind: "transaction",
      name: transactionSummaryOf(transaction),
      title: transactionTypeLabels[transaction.type].toLowerCase(),
    });
  }

  function handleTransactionSaved(draft: NewPortfolioTransaction): void {
    const isAccountMismatch =
      transactionsAccountId !== "" &&
      draft.accountId !== transactionsAccountId &&
      draft.portfolioId !== transactionsAccountId &&
      draft.otherAccountId !== transactionsAccountId &&
      draft.otherPortfolioId !== transactionsAccountId;
    if (isAccountMismatch) {
      setTransactionsAccountId("");
    }
    if (transactionsType !== "" && draft.type !== transactionsType) {
      setTransactionsType("");
    }
    if (
      transactionsSecurityId !== "" &&
      draft.securityId !== transactionsSecurityId
    ) {
      setTransactionsSecurityId("");
    }
    closeTransactionDialog();
  }

  function openCashInTransactions(accountId: string): void {
    if (
      snapshot.cashAccounts.some(
        (account) => account.id === accountId && account.isRetired,
      )
    ) {
      setIsShowingInactiveTransactions(true);
    }
    setTransactionsAccountId(accountId);
    setTransactionsType("");
    setTransactionsSecurityId("");
    onActiveTabChange("Transactions");
  }

  function openSecuritiesInHoldings(portfolioId: string): void {
    setHoldingsAccountId(portfolioId);
    onActiveTabChange("Holdings");
  }

  return (
    <>
      <ScreenTabs
        onValueChange={onActiveTabChange}
        tabs={[
          {
            children: (
              <PortfolioHoldings
                accountId={holdingsAccountId}
                holdings={snapshot.holdings}
                isReadOnly={isInScenario}
                isShowingZeroShares={isShowingZeroShares}
                label={subsectionLabel(portfolio, 1)}
                onAccountChange={setHoldingsAccountId}
                onAddSecurity={() => {
                  setIsAddingSecurity(true);
                }}
                onDeleteSecurity={requestSecurityDelete}
                onEditSecurity={openSecurityEditor}
                onShowingZeroSharesChange={setIsShowingZeroShares}
                onUpdateQuotes={() => {
                  setIsUpdatingQuotes(true);
                }}
                readOnlyId={isInScenario ? scenarioNoteId : undefined}
                securitiesAccounts={snapshot.securitiesAccounts}
              />
            ),
            label: "Holdings",
          },
          {
            children: (
              <PortfolioAccounts
                cashAccounts={snapshot.cashAccounts}
                isReadOnly={isInScenario}
                label={subsectionLabel(portfolio, 2)}
                onAddCash={() => {
                  setAddingAccount("cash");
                }}
                onAddSecurities={() => {
                  setAddingAccount("securities");
                }}
                onEditCash={openCashEditor}
                onEditSecurities={openSecuritiesEditor}
                onOpenCash={openCashInTransactions}
                onOpenSecurities={openSecuritiesInHoldings}
                readOnlyId={isInScenario ? scenarioNoteId : undefined}
                securitiesAccounts={snapshot.securitiesAccounts}
              />
            ),
            label: "Accounts",
          },
          {
            children: (
              <PortfolioTransactions
                accountId={transactionsAccountId}
                cashAccounts={snapshot.cashAccounts}
                holdings={snapshot.holdings}
                isReadOnly={isInScenario}
                isShowingInactive={isShowingInactiveTransactions}
                label={subsectionLabel(portfolio, 3)}
                onAccountChange={setTransactionsAccountId}
                onAddTransaction={() => {
                  setIsAddingTransaction(true);
                }}
                onDeleteTransaction={requestTransactionDelete}
                onEditTransaction={openTransactionEditor}
                onSecurityChange={setTransactionsSecurityId}
                onShowingInactiveChange={setIsShowingInactiveTransactions}
                onTypeChange={setTransactionsType}
                readOnlyId={isInScenario ? scenarioNoteId : undefined}
                securitiesAccounts={snapshot.securitiesAccounts}
                securityId={transactionsSecurityId}
                transactions={snapshot.transactions}
                type={transactionsType}
              />
            ),
            label: "Transactions",
          },
        ]}
        value={activeTab}
      />
      {!isInScenario && addingAccount !== null && (
        <PortfolioAccountDialog
          cashAccounts={snapshot.cashAccounts}
          defaultCurrency={snapshot.baseCurrency}
          kind={addingAccount}
          onDismiss={() => {
            setAddingAccount(null);
          }}
          onSaved={handleAccountAdded}
          securitiesAccounts={snapshot.securitiesAccounts}
          version={version}
        />
      )}
      {!isInScenario && editingAccount !== null && (
        <PortfolioAccountDialog
          cashAccounts={snapshot.cashAccounts}
          defaultCurrency={snapshot.baseCurrency}
          editing={editingAccount}
          key={editingAccount.account.id}
          kind={editingAccount.kind}
          onDelete={() => {
            const target = editingAccount;
            setEditingAccount(null);
            setDeleting({
              cancelFocusIds: [
                `${target.kind}:${target.account.id}`,
                ...editFallbackFocusRef.current,
              ],
              fallbackFocusIds: editFallbackFocusRef.current,
              id: target.account.id,
              kind: target.kind,
              name: target.account.name,
              title: target.account.name,
            });
          }}
          onDismiss={() => {
            setEditingAccount(null);
          }}
          onSaved={(outcome) => {
            handleAccountEdited(editingAccount, outcome);
          }}
          securitiesAccounts={snapshot.securitiesAccounts}
          version={version}
        />
      )}
      {!isInScenario && isAddingSecurity && (
        <PortfolioSecurityDialog
          canRecordOpening={activeSecurities.length > 0}
          categories={snapshot.categories}
          defaultCurrency={snapshot.baseCurrency}
          onDismiss={() => {
            setIsAddingSecurity(false);
          }}
          onSaved={handleSecurityAdded}
          today={today}
          version={version}
        />
      )}
      {!isInScenario && editingSecurity !== null && (
        <PortfolioSecurityDialog
          categories={snapshot.categories}
          defaultCurrency={snapshot.baseCurrency}
          key={editingSecurity.id}
          onDelete={() => {
            const target = editingSecurity;
            setEditingSecurity(null);
            setDeleting({
              cancelFocusIds: [
                `holding:${target.id}`,
                ...editFallbackFocusRef.current,
              ],
              fallbackFocusIds: editFallbackFocusRef.current,
              id: target.id,
              kind: "security",
              name: target.name,
              title: target.name,
            });
          }}
          onDismiss={() => {
            setEditingSecurity(null);
          }}
          onSaved={(outcome) => {
            handleSecurityEdited(editingSecurity, outcome);
          }}
          security={editingSecurity}
          today={today}
          version={version}
        />
      )}
      {!isInScenario && deleting !== null && (
        <ConfirmDialog
          isBusy={isDeleting}
          onCancel={() => {
            if (deleting.cancelFocusIds !== undefined) {
              pendingFocusRef.current = {
                afterVersion: version,
                tab: activeTab,
                targets: deleting.cancelFocusIds,
              };
            }
            setDeleting(null);
          }}
          onConfirm={() => {
            confirmDelete(deleting);
          }}
          title={`Delete ${deleting.title}?`}
        >
          {deleteCopyOf(deleting).confirmBody}
        </ConfirmDialog>
      )}
      {!isInScenario && isOpeningSecurityReady && (
        <PortfolioTransactionDialog
          baseCurrency={snapshot.baseCurrency}
          cashAccounts={snapshot.cashAccounts}
          gbpRates={snapshot.gbpRates}
          holdings={snapshot.holdings}
          initialDraft={openingTradeDraftOf(
            openingSecurityHandoff,
            activeSecurities,
            activeCash,
          )}
          key={`opening:${openingSecurityHandoff.securityId}`}
          onDismiss={() => {
            pendingFocusRef.current = {
              afterVersion: version,
              tab: "Holdings",
              targets: [`holding:${openingSecurityHandoff.securityId}`],
            };
            setOpeningSecurityHandoff(null);
          }}
          onSaved={(draft, nextVersion) => {
            pendingFocusRef.current = {
              afterVersion: nextVersion,
              tab: "Holdings",
              targets: [`holding:${openingSecurityHandoff.securityId}`],
            };
            setOpeningSecurityHandoff(null);
            handleTransactionSaved(draft);
          }}
          securitiesAccounts={snapshot.securitiesAccounts}
          today={today}
          version={version}
        />
      )}
      {!isInScenario && (isAddingTransaction || handoff !== null) && (
        <PortfolioTransactionDialog
          baseCurrency={snapshot.baseCurrency}
          cashAccounts={snapshot.cashAccounts}
          gbpRates={snapshot.gbpRates}
          holdings={snapshot.holdings}
          key={handoff !== null ? "handoff" : "manual"}
          onDismiss={closeTransactionDialog}
          onSaved={handleTransactionSaved}
          securitiesAccounts={snapshot.securitiesAccounts}
          today={today}
          version={version}
          {...(handoff !== null && {
            ...(handoff.amountGbp !== undefined && {
              handoffAmountGbp: handoff.amountGbp,
            }),
            initialDraft: handoff.draft,
            ...(handoff.suggestedCategory !== undefined && {
              suggestedCategory: handoff.suggestedCategory,
            }),
          })}
        />
      )}
      {!isInScenario && editingTransaction !== null && (
        <PortfolioTransactionDialog
          baseCurrency={snapshot.baseCurrency}
          cashAccounts={snapshot.cashAccounts}
          gbpRates={snapshot.gbpRates}
          holdings={snapshot.holdings}
          key={editingTransaction.id}
          onDelete={() => {
            const target = editingTransaction;
            setEditingTransaction(null);
            setDeleting({
              cancelFocusIds: [
                `transaction:${target.id}`,
                ...editFallbackFocusRef.current,
              ],
              fallbackFocusIds: editFallbackFocusRef.current,
              id: target.id,
              kind: "transaction",
              name: transactionSummaryOf(target),
              title: transactionTypeLabels[target.type].toLowerCase(),
            });
          }}
          onDismiss={() => {
            setEditingTransaction(null);
          }}
          onSaved={(draft, nextVersion) => {
            pendingFocusRef.current = {
              afterVersion: nextVersion,
              tab: activeTab,
              targets: [
                `transaction:${editingTransaction.id}`,
                ...editFallbackFocusRef.current,
              ],
            };
            handleTransactionSaved(draft);
            setEditingTransaction(null);
          }}
          securitiesAccounts={snapshot.securitiesAccounts}
          today={today}
          transaction={editingTransaction}
          version={version}
        />
      )}
      {!isInScenario && isUpdatingQuotes && (
        <PortfolioQuotesDialog
          holdings={snapshot.holdings}
          onDismiss={() => {
            setIsUpdatingQuotes(false);
          }}
          onSaved={() => {
            setIsUpdatingQuotes(false);
          }}
          today={today}
          version={version}
        />
      )}
    </>
  );
}

// Resolves a validated trade handoff against the loaded portfolio snapshot
// into an initial transaction draft and optional suggested category group.
function resolveTradeHandoff(
  trade: PortfolioTradeHandoff,
  snapshot: PortfolioSnapshot,
): ResolvedHandoff {
  const activeSecurities = snapshot.securitiesAccounts.filter(
    (account) => !account.isRetired,
  );
  const portfolioId = resolveTradePortfolioId(
    trade.portfolioId,
    activeSecurities,
  );
  const { securityId, suggestedCategory } = resolveTradeSecurity(
    trade,
    snapshot,
    portfolioId,
  );
  return {
    ...(trade.amount !== undefined && { amountGbp: trade.amount }),
    draft: {
      ...(trade.amount !== undefined && { amount: trade.amount }),
      ...(portfolioId !== undefined && { portfolioId }),
      ...(securityId !== undefined && { securityId }),
      type: trade.type,
    },
    ...(suggestedCategory !== undefined && { suggestedCategory }),
  };
}

function resolveTradePortfolioId(
  requestedPortfolioId: string | undefined,
  activeSecurities: readonly SecuritiesAccount[],
): string | undefined {
  if (requestedPortfolioId !== undefined) {
    return activeSecurities.some(
      (account) => account.id === requestedPortfolioId,
    )
      ? requestedPortfolioId
      : "";
  }
  return activeSecurities.length > 1 ? "" : undefined;
}

function resolveTradeSecurity(
  trade: PortfolioTradeHandoff,
  snapshot: PortfolioSnapshot,
  portfolioId: string | undefined,
): {
  readonly securityId?: string;
  readonly suggestedCategory?: SuggestedCategory;
} {
  const activeHoldings = snapshot.holdings.filter(
    (holding) => !holding.isRetired,
  );
  if (trade.securityId !== undefined) {
    return {
      securityId: activeHoldings.some(
        (holding) => holding.id === trade.securityId,
      )
        ? trade.securityId
        : "",
    };
  }
  if (trade.categoryId === undefined) {
    return {};
  }
  const category = snapshot.categories.find(
    (item) => item.id === trade.categoryId,
  );
  if (category === undefined) {
    return { securityId: "" };
  }
  const categoryHoldings = activeHoldings.filter((holding) =>
    category.securityIds.includes(holding.id),
  );
  const candidates =
    trade.type === "sale"
      ? saleCandidatesOf(categoryHoldings, portfolioId)
      : categoryHoldings;
  const [only, second] = candidates;
  if (only !== undefined && second === undefined) {
    return { securityId: only.id };
  }
  return {
    securityId: "",
    suggestedCategory: {
      name: category.name,
      securityIds: candidates.map((holding) => holding.id),
    },
  };
}

// Moves focus to the first visible focusable button inside the first
// surviving target row, falling back to the screen heading when none
// remain.
function restoreRowFocus(targetRowIds: readonly string[]): void {
  const rows = [...document.querySelectorAll<HTMLElement>("[data-row-id]")];
  for (const rowId of targetRowIds) {
    const container = rows.find(
      (element) => element.dataset["rowId"] === rowId,
    );
    if (container !== undefined) {
      const button = [
        ...container.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ),
      ].find(isElementVisible);
      if (button !== undefined) {
        button.focus();
        return;
      }
    }
  }
  document.querySelector<HTMLElement>("h1")?.focus();
}

function saleCandidatesOf(
  categoryHoldings: readonly Holding[],
  portfolioId: string | undefined,
): readonly Holding[] {
  const held =
    portfolioId !== undefined && portfolioId !== ""
      ? categoryHoldings.filter((holding) =>
          holding.sharesByAccount.some(
            (entry) => entry.portfolioId === portfolioId && entry.shares > 0,
          ),
        )
      : categoryHoldings.filter((holding) => holding.shares > 0);
  return held.length > 0 ? held : categoryHoldings;
}

// The opening card shown before a household .portfolio file has been uploaded.
function SectionCardUpload({
  describedBy,
  isDisabled,
}: {
  readonly describedBy?: string | undefined;
  readonly isDisabled: boolean;
}): JSX.Element {
  return (
    <SectionCard
      label={subsectionLabel(portfolio, 1)}
      title="Upload a portfolio file"
    >
      <CardContent>
        <EmptyState
          description="Upload a binary Portfolio Performance (.portfolio) file to store with the household and view its accounts, holdings and transactions."
          icon={Briefcase}
          title="No portfolio file uploaded"
        >
          <PortfolioUpload
            describedBy={describedBy}
            isDisabled={isDisabled}
            version={0}
          />
        </EmptyState>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Stored with the household, not in scenarios. Accepts a Portfolio
        Performance file saved in binary without a password, up to 4 MB.
      </CardFooter>
    </SectionCard>
  );
}

// The clean URL to replace on arrival when a trade handoff is suppressed
// because no portfolio file is stored yet or a scenario is open.
function suppressedTradeUrlOf(
  owned: null | OwnedPortfolio,
  isInScenario: boolean,
  initialTrade: PortfolioTradeHandoff | undefined,
): null | Route {
  if (initialTrade === undefined) {
    return null;
  }
  if (owned === null) {
    return portfolio.href;
  }
  return isInScenario ? `${portfolio.href}?tab=transactions` : null;
}

function transactionSummaryOf(transaction: PortfolioTransaction): string {
  const typeLabel = transactionTypeLabels[transaction.type];
  const subject =
    transaction.securityName ??
    transaction.accountName ??
    transaction.portfolioName;
  const dateText = formatDay(transaction.date);
  return subject === undefined
    ? `${typeLabel} · ${dateText}`
    : `${typeLabel} · ${subject} · ${dateText}`;
}
