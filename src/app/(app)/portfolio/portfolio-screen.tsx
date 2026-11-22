"use client";

import type { JSX } from "react";

import { Briefcase } from "lucide-react";
import { useId, useState } from "react";

import type {
  AccountKind,
  NewPortfolioAccount,
} from "@/components/app/organisms/portfolio-account-dialog";
import type {
  CashAccount,
  PortfolioSnapshot,
  SecuritiesAccount,
} from "@/data/portfolio";

import { PortfolioPicker } from "@/components/app/atoms/portfolio-picker";
import { PortfolioSummary } from "@/components/app/atoms/portfolio-summary";
import { Caution } from "@/components/app/molecules/caution";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { PortfolioAccountDialog } from "@/components/app/organisms/portfolio-account-dialog";
import { PortfolioAccounts } from "@/components/app/organisms/portfolio-accounts";
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
  readonly isInScenario: boolean;
  readonly today: string;
}

// The Portfolio screen, held in the browser around a binary Portfolio
// Performance (.portfolio) file opened from this device. Before a file
// is chosen it offers a single primary picker and states that the file
// stays on the device. Once opened it leads with the headline answer
// sentence, the four-column summary strip, any scenario, currency or
// preview notices, and the paired Accounts sheet. Preview accounts stay
// in tab state only and never modify the file; opening another file
// resets them cleanly.
export function PortfolioScreen({
  isInScenario,
  today,
}: PortfolioScreenProps): JSX.Element {
  const [snapshot, setSnapshot] = useState<null | PortfolioSnapshot>(null);
  const [fileKey, setFileKey] = useState(0);
  const [draftSecurities, setDraftSecurities] = useState<
    readonly SecuritiesAccount[]
  >([]);
  const [draftCash, setDraftCash] = useState<readonly CashAccount[]>([]);
  const [addingAccount, setAddingAccount] = useState<AccountKind | null>(null);
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

  function clearPreview(): void {
    setDraftSecurities([]);
    setDraftCash([]);
  }

  function openFile(opened: PortfolioSnapshot): void {
    setSnapshot(opened);
    setFileKey((current) => current + 1);
    setDraftSecurities([]);
    setDraftCash([]);
    setAddingAccount(null);
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
  const securitiesAccounts = [
    ...snapshot.securitiesAccounts,
    ...draftSecurities,
  ];
  const cashAccounts = [...snapshot.cashAccounts, ...draftCash];
  const dialogCashAccounts = [...snapshotActiveCash, ...draftCash];
  const hasPreview = draftSecurities.length > 0 || draftCash.length > 0;

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
        cashAccountCount={snapshotActiveCash.length}
        latestQuoteDate={snapshot.latestQuoteDate}
        securitiesAccountCount={snapshotActiveSecurities.length}
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
      <PortfolioAccounts
        cashAccounts={cashAccounts}
        isReadOnly={isInScenario}
        key={fileKey}
        label={subsectionLabel(portfolio, 1)}
        onAddCash={() => {
          setAddingAccount("cash");
        }}
        onAddSecurities={() => {
          setAddingAccount("securities");
        }}
        readOnlyId={isInScenario ? scenarioNoteId : undefined}
        securitiesAccounts={securitiesAccounts}
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
    </Screen>
  );
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
