"use client";

import type { Route } from "next";
import type { JSX } from "react";

import { Briefcase, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { AccountKind } from "@/components/app/organisms/portfolio-account-dialog";
import type {
  PortfolioTransactionDraft,
  SuggestedCategory,
} from "@/components/app/organisms/portfolio-transaction-dialog";
import type {
  Holding,
  NewPortfolioTransaction,
  PortfolioSnapshot,
  SecuritiesAccount,
  TransactionType,
} from "@/data/portfolio";
import type { OwnedPortfolio } from "@/store/portfolio";

import { PortfolioSummary } from "@/components/app/atoms/portfolio-summary";
import { Caution } from "@/components/app/molecules/caution";
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
  const [isAddingSecurity, setIsAddingSecurity] = useState(false);
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [handoff, setHandoff] = useState<null | ResolvedHandoff>(() =>
    initialTrade !== undefined
      ? resolveTradeHandoff(initialTrade, snapshot)
      : null,
  );
  const [isUpdatingQuotes, setIsUpdatingQuotes] = useState(false);
  const [isScenarioOpen, setIsScenarioOpen] = useState(isInScenario);
  const isHandoffOpen = handoff !== null;
  const wasHandoffOpenRef = useRef(isHandoffOpen);

  useEffect(() => {
    if (wasHandoffOpenRef.current && !isHandoffOpen) {
      document.querySelector<HTMLElement>("h1")?.focus();
      router.replace(`${portfolio.href}?tab=transactions`, { scroll: false });
    }
    wasHandoffOpenRef.current = isHandoffOpen;
  }, [isHandoffOpen, router]);

  if (isScenarioOpen !== isInScenario) {
    setIsScenarioOpen(isInScenario);
    if (isInScenario) {
      setAddingAccount(null);
      setHandoff(null);
      setIsAddingSecurity(false);
      setIsAddingTransaction(false);
      setIsUpdatingQuotes(false);
    }
  }

  const activeCashAccounts = snapshot.cashAccounts.filter(
    (account) => !account.isRetired,
  );

  function closeTransactionDialog(): void {
    if (handoff !== null) {
      setHandoff(null);
      onInitialTradeClosed();
    }
    setIsAddingTransaction(false);
  }

  function handleAccountSaved(): void {
    setAddingAccount(null);
  }

  function handleSecuritySaved(): void {
    setHoldingsAccountId("");
    setIsShowingZeroShares(true);
    setIsAddingSecurity(false);
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
          cashAccounts={activeCashAccounts}
          defaultCurrency={snapshot.baseCurrency}
          kind={addingAccount}
          onDismiss={() => {
            setAddingAccount(null);
          }}
          onSaved={handleAccountSaved}
          version={version}
        />
      )}
      {!isInScenario && isAddingSecurity && (
        <PortfolioSecurityDialog
          categories={snapshot.categories}
          defaultCurrency={snapshot.baseCurrency}
          onDismiss={() => {
            setIsAddingSecurity(false);
          }}
          onSaved={handleSecuritySaved}
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
