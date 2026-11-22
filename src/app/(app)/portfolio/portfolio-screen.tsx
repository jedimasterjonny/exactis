"use client";

import type { JSX } from "react";

import { Briefcase } from "lucide-react";
import { useId, useState } from "react";

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

import { PortfolioPicker } from "@/components/app/atoms/portfolio-picker";
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
import { SectionCard } from "@/components/app/organisms/section-card";
import { Screen } from "@/components/app/templates/screen";
import { Badge } from "@/components/kit/badge";
import { Button } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import { toast } from "@/components/kit/toast";
import { counted } from "@/lib/count";
import { formatGbp } from "@/lib/money";
import { portfolio, sectionLabel, subsectionLabel } from "@/lib/nav";

interface PortfolioScreenProps {
  readonly initialTab?: string | undefined;
  readonly isInScenario: boolean;
  readonly today: string;
}

type PortfolioTab = "Accounts" | "Holdings" | "Transactions";

// The Portfolio screen, held in the browser around a binary Portfolio
// Performance (.portfolio) file opened from this device. Before a file
// is chosen it offers a single primary picker and states that the file
// stays on the device. Once opened it leads with the headline answer
// sentence, the four-column summary strip, any scenario, currency or
// preview notices, and controlled Holdings, Accounts and Transactions
// tabs. Clicking a securities account in Accounts switches to Holdings
// filtered by that account's UUID, clicking a cash account switches to
// Transactions filtered by that account's UUID, and ScreenTabs restores
// focus onto the destination panel. Preview additions stay in tab state
// only and never modify the file or alter the real-file headline and
// summary strip; opening another file resets them cleanly.
export function PortfolioScreen({
  initialTab,
  isInScenario,
  today,
}: PortfolioScreenProps): JSX.Element {
  const [snapshot, setSnapshot] = useState<null | PortfolioSnapshot>(null);
  const [fileKey, setFileKey] = useState(0);
  const [draftSecurities, setDraftSecurities] = useState<
    readonly SecuritiesAccount[]
  >([]);
  const [draftCash, setDraftCash] = useState<readonly CashAccount[]>([]);
  const [draftHoldings, setDraftHoldings] = useState<readonly Holding[]>([]);
  const [draftTransactions, setDraftTransactions] = useState<
    readonly PortfolioTransaction[]
  >([]);
  const [activeTab, setActiveTab] = useState<PortfolioTab>(() =>
    initialTabOf(initialTab),
  );
  const [holdingsAccountId, setHoldingsAccountId] = useState("");
  const [isShowingZeroShares, setIsShowingZeroShares] = useState(false);
  const [transactionsAccountId, setTransactionsAccountId] = useState("");
  const [transactionsType, setTransactionsType] = useState<
    "" | TransactionType
  >("");
  const [transactionsSecurityId, setTransactionsSecurityId] = useState("");
  const [addingAccount, setAddingAccount] = useState<AccountKind | null>(null);
  const [isAddingSecurity, setIsAddingSecurity] = useState(false);
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const scenarioNoteId = useId();

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
      setDraftCash((current) => [...current, added]);
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
      setDraftSecurities((current) => [...current, added]);
    }
    setAddingAccount(null);
    toast.add({
      description:
        "Shown in this view only. Changes are not saved to the file yet.",
      title: "Account added to preview",
      type: "info",
    });
  }

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
    setDraftHoldings((current) => [...current, added]);
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

  function clearPreview(): void {
    setDraftSecurities([]);
    setDraftCash([]);
    setDraftHoldings([]);
    setDraftTransactions([]);
  }

  function openCashInTransactions(accountId: string): void {
    setTransactionsAccountId(accountId);
    setTransactionsType("");
    setTransactionsSecurityId("");
    setActiveTab("Transactions");
  }

  function openFile(opened: PortfolioSnapshot): void {
    setSnapshot(opened);
    setFileKey((current) => current + 1);
    setDraftSecurities([]);
    setDraftCash([]);
    setDraftHoldings([]);
    setDraftTransactions([]);
    setHoldingsAccountId("");
    setIsShowingZeroShares(false);
    setTransactionsAccountId("");
    setTransactionsType("");
    setTransactionsSecurityId("");
    setAddingAccount(null);
    setIsAddingSecurity(false);
    setIsAddingTransaction(false);
  }

  function openSecuritiesInHoldings(portfolioId: string): void {
    setHoldingsAccountId(portfolioId);
    setActiveTab("Holdings");
  }

  if (snapshot === null) {
    return (
      <Screen
        label={sectionLabel(portfolio)}
        meta="No file open"
        title={portfolio.title}
      >
        <SectionCardOpen onOpened={openFile} />
      </Screen>
    );
  }

  const snapshotActiveSecurities = snapshot.securitiesAccounts.filter(
    (account) => !account.isRetired,
  );
  const snapshotActiveCash = snapshot.cashAccounts.filter(
    (account) => !account.isRetired,
  );
  const snapshotActiveHoldingsCount = snapshot.holdings.filter(
    (holding) => holding.shares > 0,
  ).length;
  const securitiesAccounts = [
    ...snapshot.securitiesAccounts,
    ...draftSecurities,
  ];
  const cashAccounts = [...snapshot.cashAccounts, ...draftCash];
  const holdings = [...snapshot.holdings, ...draftHoldings];
  const transactions = [...draftTransactions, ...snapshot.transactions];
  const dialogCashAccounts = [...snapshotActiveCash, ...draftCash];
  const hasPreview =
    draftSecurities.length > 0 ||
    draftCash.length > 0 ||
    draftHoldings.length > 0 ||
    draftTransactions.length > 0;

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
    setDraftTransactions((current) => [added, ...current]);
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

  return (
    <Screen
      actions={
        <PortfolioPicker
          label="Switch file"
          onOpened={openFile}
          variant="outline"
        />
      }
      label={sectionLabel(portfolio)}
      meta={
        <>
          {`${snapshot.fileName} · ${snapshot.baseCurrency}`}
          <Badge variant="caution">View only</Badge>
        </>
      }
      title={portfolio.title}
    >
      {isInScenario && (
        <Caution id={scenarioNoteId} title="Portfolio belongs to the household">
          Leave the scenario to add preview entries.
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
      <ScreenTabs
        onValueChange={setActiveTab}
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
                key={fileKey}
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
                key={fileKey}
                label={subsectionLabel(portfolio, 3)}
                onAccountChange={setTransactionsAccountId}
                onAddTransaction={() => {
                  setIsAddingTransaction(true);
                }}
                onSecurityChange={setTransactionsSecurityId}
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

// The opening card shown before a .portfolio file has been selected.
function SectionCardOpen({
  onOpened,
}: {
  readonly onOpened: (snapshot: PortfolioSnapshot) => void;
}): JSX.Element {
  return (
    <SectionCard
      label={subsectionLabel(portfolio, 1)}
      title="Open a portfolio file"
    >
      <CardContent>
        <EmptyState
          description="Open a binary Portfolio Performance (.portfolio) file to view its accounts, holdings and transactions."
          icon={Briefcase}
          title="No portfolio file open"
        >
          <PortfolioPicker
            label="Open .portfolio file"
            onOpened={onOpened}
            variant="default"
          />
        </EmptyState>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        The file is read in your browser and never leaves this device.
      </CardFooter>
    </SectionCard>
  );
}
