import type { JSX } from "react";

import { Info, Plus } from "lucide-react";

import { AccountTable } from "@/components/account-table";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { accounts, isAsset } from "@/data/accounts";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";

// The reference's plan screen opens on its accounts tab, and this screen is
// that tab split in two: the wrappers and cash on one, the real assets and
// the loans against them on the other. Every figure is the reference kit's
// invented plan, standing in until there is an engine to read from.
export default function Accounts(): JSX.Element {
  const held = accounts.filter((account) => !isAsset(account));
  const assets = accounts.filter(isAsset);
  return (
    <>
      <ScreenHeader
        // Adding an account needs the edit dialog, which the button waits for.
        actions={
          <Button size="sm">
            <Plus aria-hidden />
            Add account
          </Button>
        }
        label={sectionLabel(accountsAndAssets)}
        title="Accounts & assets"
      >
        {`${String(held.length)} accounts · ${String(assets.length)} assets`}
      </ScreenHeader>
      <div className="grid gap-5 p-8">
        <Tabs defaultValue="accounts">
          <TabsList variant="line">
            <TabsTrigger value="accounts">
              Accounts
              <TabCount count={held.length} />
            </TabsTrigger>
            <TabsTrigger value="assets">
              Assets
              <TabCount count={assets.length} />
            </TabsTrigger>
          </TabsList>
          <TabsContent className="grid gap-5" value="accounts">
            <AccountTable accounts={held} />
            <Note>
              Allocation is set once at plan level and applied pro rata to every
              account.
            </Note>
          </TabsContent>
          <TabsContent className="grid gap-5" value="assets">
            <AccountTable accounts={assets} />
            <Note>
              A loan is listed against the asset it secures. The progress points
              reconcile the two as total assets and asset loans.
            </Note>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

// The muted note that closes a screen's section, as on the progress screen.
function Note({ children }: { readonly children: string }): JSX.Element {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

// The row count beside a tab's label, in the micro-label face and faint.
function TabCount({ count }: { readonly count: number }): JSX.Element {
  return (
    <span className="label text-muted-foreground/60">{String(count)}</span>
  );
}
