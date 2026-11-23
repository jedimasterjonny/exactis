"use client";

import type { JSX } from "react";

import { Briefcase, Download } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type {
  AccountKind,
  NewPortfolioAccount,
} from "@/components/app/organisms/portfolio-account-dialog";
import type { NewPortfolioSecurity } from "@/components/app/organisms/portfolio-security-dialog";
import type { NewPortfolioTransaction } from "@/components/app/organisms/portfolio-transaction-dialog";
import type {
  CashAccount,
  Holding,
  PortfolioSnapshot,
  PortfolioTransaction,
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
import { PortfolioSecurityDialog } from "@/components/app/organisms/portfolio-security-dialog";
import { PortfolioTransactionDialog } from "@/components/app/organisms/portfolio-transaction-dialog";
import { PortfolioTransactions } from "@/components/app/organisms/portfolio-transactions";
import { PortfolioUpload } from "@/components/app/organisms/portfolio-upload";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Screen } from "@/components/app/templates/screen";
import { Badge } from "@/components/kit/badge";
import { Button, buttonVariants } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import { toast } from "@/components/kit/toast";
import { counted } from "@/lib/count";
import { formatGbp } from "@/lib/money";
import { formatDay } from "@/lib/months";
import { portfolio, sectionLabel, subsectionLabel } from "@/lib/nav";

interface OwnedPortfolioTabsProps {
  readonly activeTab: PortfolioTab;
  readonly drafts: PreviewEntries;
  readonly isInScenario: boolean;
  readonly onActiveTabChange: (tab: PortfolioTab) => void;
  readonly onUpdateDrafts: (
    update: (current: PreviewEntries) => PreviewEntries,
  ) => void;
  readonly scenarioNoteId: string;
  readonly snapshot: PortfolioSnapshot;
  readonly today: string;
}

interface PortfolioScreenProps {
  readonly initialTab?: string | undefined;
  readonly isInScenario: boolean;
  readonly owned: null | OwnedPortfolio;
  readonly today: string;
}

type PortfolioTab = "Accounts" | "Holdings" | "Transactions";

interface PreviewDrafts {
  readonly cash: readonly CashAccount[];
  readonly forVersion: number;
  readonly holdings: readonly Holding[];
  readonly securities: readonly SecuritiesAccount[];
  readonly transactions: readonly PortfolioTransaction[];
}

type PreviewEntries = Omit<PreviewDrafts, "forVersion">;

const emptyDrafts: PreviewEntries = {
  cash: [],
  holdings: [],
  securities: [],
  transactions: [],
};

// The Portfolio screen backed by the household's versioned binary
// Portfolio Performance (.portfolio) file stored in Postgres. Before a
// file is uploaded it renders a single primary upload CTA (locked while
// a scenario is open). Once stored it renders the server-parsed
// snapshot with Download .portfolio and confirm-guarded Replace file…
// actions in the header, moves focus to h1 on the empty-to-owned
// transition so focus never drops to document.body, and keeps preview
// drafts tagged with forVersion so PortfolioUpload stays mounted across
// replacements while the version-keyed tabs/filters subtree resets
// cleanly.
export function PortfolioScreen({
  initialTab,
  isInScenario,
  owned,
  today,
}: PortfolioScreenProps): JSX.Element {
  const [drafts, setDrafts] = useState<null | PreviewDrafts>(null);
  const [activeTab, setActiveTab] = useState<PortfolioTab>(() =>
    initialTabOf(initialTab),
  );
  const scenarioNoteId = useId();
  const hasOwned = owned !== null;
  const wasEmptyRef = useRef(!hasOwned);

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
  const activeDrafts =
    drafts !== null && drafts.forVersion === version ? drafts : emptyDrafts;
  const hasPreview =
    activeDrafts.securities.length > 0 ||
    activeDrafts.cash.length > 0 ||
    activeDrafts.holdings.length > 0 ||
    activeDrafts.transactions.length > 0;
  const snapshotActiveSecurities = snapshot.securitiesAccounts.filter(
    (account) => !account.isRetired,
  );
  const snapshotActiveCash = snapshot.cashAccounts.filter(
    (account) => !account.isRetired,
  );
  const snapshotActiveHoldingsCount = snapshot.holdings.filter(
    (holding) => holding.shares > 0,
  ).length;

  function updateDrafts(
    update: (current: PreviewEntries) => PreviewEntries,
  ): void {
    setDrafts((current) => ({
      ...update(
        current !== null && current.forVersion === version
          ? current
          : emptyDrafts,
      ),
      forVersion: version,
    }));
  }

  function clearPreview(): void {
    setDrafts(null);
  }

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
            hasPreview={hasPreview}
            isDisabled={isInScenario}
            version={version}
          />
        </>
      }
      label={sectionLabel(portfolio)}
      meta={
        <>
          <span className="min-w-0 wrap-anywhere">
            {`${snapshot.fileName} · ${snapshot.baseCurrency} · Saved ${formatDay(savedOn)}`}
          </span>
          <Badge variant="caution">View only</Badge>
        </>
      }
      title={portfolio.title}
    >
      {isInScenario && (
        <Caution id={scenarioNoteId} title="Portfolio belongs to the household">
          Leave the scenario to replace the file or add preview entries.
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
      {hasPreview && (
        <Caution
          action={
            <Button onClick={clearPreview} size="sm" variant="outline">
              Clear preview
            </Button>
          }
          title="Preview entries are kept in this browser tab only"
        >
          Balances and holdings are not recalculated.
        </Caution>
      )}
      {/* Phase 3 hook: narrow this version-keyed filter reset to whole-file
          replacements once protobuf write-back increments version on
          single-entry edits. */}
      <OwnedPortfolioTabs
        activeTab={activeTab}
        drafts={activeDrafts}
        isInScenario={isInScenario}
        key={version}
        onActiveTabChange={setActiveTab}
        onUpdateDrafts={updateDrafts}
        scenarioNoteId={scenarioNoteId}
        snapshot={snapshot}
        today={today}
      />
    </Screen>
  );
}

// Known sterling factor for a preview security's quote currency.
function draftGbpRateOf(currency: string): null | number {
  if (currency === "GBP") {
    return 1;
  }
  return currency === "GBX" ? 0.01 : null;
}

// The starting tab from an optional ?tab= query parameter.
function initialTabOf(tab: string | undefined): PortfolioTab {
  const normalized = tab?.toLowerCase();
  if (normalized === "accounts") {
    return "Accounts";
  }
  return normalized === "transactions" ? "Transactions" : "Holdings";
}

// Version-keyed tabs, filters, switches, and preview dialogs for the
// owned portfolio file. Keying this inner component by owned.version
// resets filters, retired/inactive switches, and open preview dialogs
// when the stored file is replaced without unmounting PortfolioUpload
// in ScreenHeader or losing the user's active tab.
function OwnedPortfolioTabs({
  activeTab,
  drafts,
  isInScenario,
  onActiveTabChange,
  onUpdateDrafts,
  scenarioNoteId,
  snapshot,
  today,
}: OwnedPortfolioTabsProps): JSX.Element {
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

  const snapshotActiveCash = snapshot.cashAccounts.filter(
    (account) => !account.isRetired,
  );
  const securitiesAccounts = [
    ...snapshot.securitiesAccounts,
    ...drafts.securities,
  ];
  const cashAccounts = [...snapshot.cashAccounts, ...drafts.cash];
  const holdings = [...snapshot.holdings, ...drafts.holdings];
  const transactions = [...drafts.transactions, ...snapshot.transactions];
  const dialogCashAccounts = [...snapshotActiveCash, ...drafts.cash];

  // Phase 3 write-back hook: replace preview-only draft state with a
  // protobuf-mutating Server Action writing to portfolio_files.
  function addPreviewAccount(draft: NewPortfolioAccount): void {
    const id = crypto.randomUUID();
    if (draft.kind === "cash") {
      const added: CashAccount = {
        balance: 0,
        balanceGbp: 0,
        currency: draft.currency,
        id,
        isDraft: true,
        isRetired: false,
        name: draft.name,
        ...(draft.note !== undefined && { note: draft.note }),
        transactionCount: 0,
      };
      onUpdateDrafts((current) => ({
        ...current,
        cash: [...current.cash, added],
      }));
    } else {
      const added: SecuritiesAccount = {
        holdingsCount: 0,
        id,
        isDraft: true,
        isRetired: false,
        marketValue: 0,
        name: draft.name,
        ...(draft.note !== undefined && { note: draft.note }),
        ...(draft.referenceAccountId !== undefined && {
          referenceAccountId: draft.referenceAccountId,
        }),
      };
      onUpdateDrafts((current) => ({
        ...current,
        securities: [...current.securities, added],
      }));
    }
    setAddingAccount(null);
    toast.add({
      description:
        "Shown in this view only. Changes are not saved to the file yet.",
      title: "Account added to preview",
      type: "info",
    });
  }

  // Phase 3 write-back hook: replace preview-only draft state with a
  // protobuf-mutating Server Action writing to portfolio_files.
  function addPreviewSecurity(draft: NewPortfolioSecurity): void {
    const added: Holding = {
      ...(draft.category !== undefined && { category: draft.category }),
      currency: draft.currency,
      gbpRate: draftGbpRateOf(draft.currency),
      id: crypto.randomUUID(),
      isDraft: true,
      isRetired: false,
      ...(draft.isin !== undefined && { isin: draft.isin }),
      latestPrice: draft.latestPrice,
      latestPriceDate: null,
      name: draft.name,
      ...(draft.note !== undefined && { note: draft.note }),
      shares: 0,
      sharesByAccount: [],
      ...(draft.ticker !== undefined && { ticker: draft.ticker }),
    };
    onUpdateDrafts((current) => ({
      ...current,
      holdings: [...current.holdings, added],
    }));
    setHoldingsAccountId("");
    setIsShowingZeroShares(true);
    setIsAddingSecurity(false);
    toast.add({
      description:
        "Shown in this view only. Changes are not saved to the file yet.",
      title: "Security added to preview",
      type: "info",
    });
  }

  // Phase 3 write-back hook: replace preview-only draft state with a
  // protobuf-mutating Server Action writing to portfolio_files.
  function addPreviewTransaction(draft: NewPortfolioTransaction): void {
    const accountNames = new Map(
      cashAccounts.map((account) => [account.id, account.name]),
    );
    const portfolioNames = new Map(
      securitiesAccounts.map((account) => [account.id, account.name]),
    );
    const securityNames = new Map(
      holdings.map((holding) => [holding.id, holding.name]),
    );
    const accountName =
      draft.accountId === undefined
        ? undefined
        : accountNames.get(draft.accountId);
    const otherAccountName =
      draft.otherAccountId === undefined
        ? undefined
        : accountNames.get(draft.otherAccountId);
    const portfolioName =
      draft.portfolioId === undefined
        ? undefined
        : portfolioNames.get(draft.portfolioId);
    const otherPortfolioName =
      draft.otherPortfolioId === undefined
        ? undefined
        : portfolioNames.get(draft.otherPortfolioId);
    const securityName =
      draft.securityId === undefined
        ? undefined
        : securityNames.get(draft.securityId);

    const added: PortfolioTransaction = {
      ...draft,
      ...(accountName !== undefined && { accountName }),
      id: crypto.randomUUID(),
      isDraft: true,
      ...(otherAccountName !== undefined && { otherAccountName }),
      ...(otherPortfolioName !== undefined && { otherPortfolioName }),
      ...(portfolioName !== undefined && { portfolioName }),
      ...(securityName !== undefined && { securityName }),
      timestamp: Math.floor(Date.parse(`${draft.date}T00:00:00Z`) / 1000),
    };
    onUpdateDrafts((current) => ({
      ...current,
      transactions: [added, ...current.transactions],
    }));
    setTransactionsAccountId("");
    setTransactionsType("");
    setTransactionsSecurityId("");
    setIsAddingTransaction(false);
    toast.add({
      description:
        "Shown in this view only. Changes are not saved to the file yet.",
      title: "Transaction added to preview",
      type: "info",
    });
  }

  function openCashInTransactions(accountId: string): void {
    if (
      cashAccounts.some(
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
                holdings={holdings}
                isReadOnly={isInScenario}
                isShowingZeroShares={isShowingZeroShares}
                label={subsectionLabel(portfolio, 1)}
                onAccountChange={setHoldingsAccountId}
                onAddSecurity={() => {
                  setIsAddingSecurity(true);
                }}
                onShowingZeroSharesChange={setIsShowingZeroShares}
                readOnlyId={isInScenario ? scenarioNoteId : undefined}
                securitiesAccounts={securitiesAccounts}
              />
            ),
            label: "Holdings",
          },
          {
            children: (
              <PortfolioAccounts
                cashAccounts={cashAccounts}
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
                securitiesAccounts={securitiesAccounts}
              />
            ),
            label: "Accounts",
          },
          {
            children: (
              <PortfolioTransactions
                accountId={transactionsAccountId}
                cashAccounts={cashAccounts}
                holdings={holdings}
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
                securitiesAccounts={securitiesAccounts}
                securityId={transactionsSecurityId}
                transactions={transactions}
                type={transactionsType}
              />
            ),
            label: "Transactions",
          },
        ]}
        value={activeTab}
      />
      {addingAccount !== null && (
        <PortfolioAccountDialog
          cashAccounts={dialogCashAccounts}
          defaultCurrency={snapshot.baseCurrency}
          kind={addingAccount}
          onAdd={addPreviewAccount}
          onDismiss={() => {
            setAddingAccount(null);
          }}
        />
      )}
      {isAddingSecurity && (
        <PortfolioSecurityDialog
          categories={snapshot.categories}
          defaultCurrency={snapshot.baseCurrency}
          onAdd={addPreviewSecurity}
          onDismiss={() => {
            setIsAddingSecurity(false);
          }}
        />
      )}
      {isAddingTransaction && (
        <PortfolioTransactionDialog
          baseCurrency={snapshot.baseCurrency}
          cashAccounts={cashAccounts}
          holdings={holdings}
          onAdd={addPreviewTransaction}
          onDismiss={() => {
            setIsAddingTransaction(false);
          }}
          securitiesAccounts={securitiesAccounts}
          today={today}
        />
      )}
    </>
  );
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
