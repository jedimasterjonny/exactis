"use client";

import type { ChangeEvent, JSX } from "react";

import {
  ChartPie,
  Crosshair,
  Download,
  FolderSync,
  RefreshCw,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Cma, Mapping } from "@/data/cma";
import type { Targets } from "@/data/targets";

import { pullLifeStrategy } from "@/actions/lifestrategy";
import { importTargets, mapByName } from "@/actions/targets";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { SectionCard } from "@/components/app/molecules/section-card";
import { TargetTable } from "@/components/app/organisms/target-table";
import { Badge } from "@/components/kit/badge";
import { Button, buttonVariants } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import { suggestedMappings } from "@/data/class-table";
import { fund, retargeted, split } from "@/data/lifestrategy";
import { useSender } from "@/hooks/use-sender";
import { acceptedOf, saved } from "@/lib/answer";
import { formatWholePercent } from "@/lib/money";
import { formatDay } from "@/lib/months";
import { assumptions, subsectionLabel } from "@/lib/nav";
import { readTargets, reweighted, taxonomy } from "@/lib/portfolio-file";

// What the file picker was opened for: to import the file as it is, or
// to retarget it from LifeStrategy first.
type Purpose = "import" | "retarget";

// The file as retargeted, to be saved over the original: its name, and
// the address its bytes are held at in this browser.
interface Rewritten {
  readonly name: string;
  readonly url: string;
}

interface TargetAllocationProps {
  readonly cma: Cma | null;
  readonly mappings: readonly Mapping[];
  readonly targets: null | Targets;
}

// What the split reads as, "90% equity and 10% bonds".
const splitSaid = `${formatWholePercent(split.stocks)} equity and ${formatWholePercent(split.bonds)} bonds`;

// The assumptions screen's target allocation: the categories Portfolio
// Performance's Asset Allocation taxonomy holds, the share of the whole
// it sets each, and the class of the latest CMA each is mapped onto,
// which the rates derived from the CMA are blended from. The header says
// the day the targets were imported, and imports them again from a file
// chosen on this device, Portfolio Performance's own file as it saves
// it. The file is read here in the browser rather than sent, since it
// holds every holding and transaction beside the taxonomy, so the
// store is sent the categories alone, each with what it holds worked
// out here. The
// import spins while the file is read and the store asked, and the
// store's answer draws the screen again from the targets kept, under a
// toast. A file that cannot be read, or targets the store refuses, are
// said why under a toast, and nothing is kept. The picker is emptied as soon
// as a file is taken from it, so the same file chosen again, saved
// since, is read again. Before anything is imported there is no table
// to lay out, and the card says so. The footer states how a target is
// worked out and the check the targets pass before they are kept.
//
// The header also retargets the allocation from LifeStrategy 80%
// Equity, from a file chosen the same way: what the fund holds is
// pulled from Vanguard by the store, since Vanguard answers only its
// own site from a browser, and laid over the file's categories here, at
// 90% equity and 10% bonds in the fund's own ratios; the weights are
// written into the file, and the file as rewritten is read and imported
// as a chosen file is, so the targets kept are the ones the file now
// holds. The file is read before Vanguard is asked, so one that cannot
// be read asks for nothing. Once it is imported the header offers the
// rewritten file to download under the name it was chosen by, to be
// saved over the original, so Portfolio Performance and the store hold
// one allocation; the offer stands until the next retarget replaces it,
// or a file imported as it is takes it off, since the file offered
// would then no longer be the allocation the store holds.
//
// While a category the CMA cannot blend has a class its name suggests,
// the header offers to map every such category by name, saying how many
// it would map. The mapping spins while it is on its way, and the
// store's answer draws the screen again from the mappings kept, under a
// toast saying how many it mapped, or says why under a toast. A class
// chosen by hand is never written over, and the table shows each class
// mapped, so what was suggested can be checked and changed.
export function TargetAllocation({
  cma,
  mappings,
  targets,
}: TargetAllocationProps): JSX.Element {
  const pickerRef = useRef<HTMLInputElement>(null);
  const purposeRef = useRef<Purpose>("import");
  const [rewritten, setRewritten] = useState<null | Rewritten>(null);
  const { isSending: isImporting, send } = useSender();
  const { isSending: isMapping, send: sendMapping } = useSender();
  const { isSending: isRetargeting, send: sendRetarget } = useSender();
  const suggested =
    cma === null || targets === null
      ? 0
      : suggestedMappings(cma, targets, mappings).length;

  // The address of the file last retargeted is let go when another
  // replaces it, when a file imported as it is takes it off, and when
  // the card leaves the screen.
  useEffect(
    (): (() => void) => () => {
      if (rewritten !== null) {
        URL.revokeObjectURL(rewritten.url);
      }
    },
    [rewritten],
  );

  function importFile(file: File): void {
    send(
      async () =>
        importTargets(readTargets(new Uint8Array(await file.arrayBuffer()))),
      {
        failure: "Allocation not imported",
        onAccepted: () => {
          setRewritten(null);
        },
        success: (imported) => ({
          description: `From the ${taxonomy} taxonomy, as at ${formatDay(imported.importedOn)}`,
          title: "Target allocation imported",
        }),
      },
    );
  }

  function mapNames(): void {
    sendMapping(mapByName, {
      failure: "Classes not mapped",
      success: (mapped) => ({
        description: `${String(mapped.length)} ${mapped.length === 1 ? "category" : "categories"} mapped onto the class its name suggests`,
        title: "Classes mapped by name",
      }),
    });
  }

  function pick(purpose: Purpose): void {
    purposeRef.current = purpose;
    pickerRef.current?.click();
  }

  function retarget(file: File): void {
    sendRetarget(
      async () => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const held = readTargets(bytes);
        const holdings = acceptedOf(await pullLifeStrategy());
        const written = reweighted(bytes, retargeted(held, holdings));
        const imported = await importTargets(readTargets(written));
        return imported.kind === "saved"
          ? saved({ asOf: holdings.asOf, written })
          : imported;
      },
      {
        failure: "Allocation not retargeted",
        onAccepted: ({ written }) => {
          setRewritten({
            name: file.name,
            url: URL.createObjectURL(new Blob([written])),
          });
        },
        success: ({ asOf }) => ({
          description: `${fund.name} as at ${formatDay(asOf)}, at ${splitSaid}`,
          title: "Target allocation retargeted",
        }),
      },
    );
  }

  function take(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) {
      return;
    }
    if (purposeRef.current === "retarget") {
      retarget(file);
    } else {
      importFile(file);
    }
  }

  return (
    <SectionCard
      actions={
        <>
          {targets !== null && (
            <Badge variant="secondary">
              <FolderSync aria-hidden />
              {`Imported ${formatDay(targets.importedOn)}`}
            </Badge>
          )}
          {suggested > 0 && (
            <Button
              isBusy={isMapping}
              onClick={mapNames}
              size="sm"
              variant="outline"
            >
              <WandSparkles aria-hidden />
              {`Map ${String(suggested)} by name`}
            </Button>
          )}
          <input
            accept=".portfolio"
            aria-label="Portfolio Performance file"
            className="hidden"
            onChange={take}
            ref={pickerRef}
            type="file"
          />
          {rewritten !== null && (
            <a
              className={buttonVariants({ size: "sm", variant: "outline" })}
              download={rewritten.name}
              href={rewritten.url}
            >
              <Download aria-hidden />
              Download the retargeted file
            </a>
          )}
          <Button
            isBusy={isRetargeting}
            onClick={() => {
              pick("retarget");
            }}
            size="sm"
            variant="outline"
          >
            <Crosshair aria-hidden />
            {`Retarget from ${fund.name}`}
          </Button>
          <Button
            isBusy={isImporting}
            onClick={() => {
              pick("import");
            }}
            size="sm"
            variant="outline"
          >
            <RefreshCw aria-hidden />
            {targets === null
              ? "Import from Portfolio Performance"
              : "Reload from Portfolio Performance"}
          </Button>
        </>
      }
      label={subsectionLabel(assumptions, 3)}
      title="Target allocation"
    >
      {targets === null ? (
        <CardContent>
          <EmptyState
            description={`Import a Portfolio Performance file to read the target allocation set in its ${taxonomy} taxonomy.`}
            icon={ChartPie}
            title="No allocation imported yet"
          />
        </CardContent>
      ) : (
        <TargetTable
          categories={targets.categories}
          cma={cma}
          mappings={mappings}
        />
      )}
      <CardFooter className="text-sm text-muted-foreground">
        {`A target is its class's weight times the weights of the classes above it in the ${taxonomy} taxonomy, and the targets are checked to add up to 100% before they are kept. The file is read in the browser, and only the targets and what each category holds leave it; the holdings, prices and transactions they are worked out from do not. Each category blends at the 20-year GBP return of its CMA class. Retargeting from ${fund.name} gives each category the share of the fund its own fund holds, at ${splitSaid}, writes the weights into the file and imports it; the file can then be downloaded and saved over the original.`}
      </CardFooter>
    </SectionCard>
  );
}
