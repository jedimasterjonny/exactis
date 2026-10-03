"use client";

import type { ChangeEvent, JSX } from "react";

import { ChartPie, FolderSync, RefreshCw, WandSparkles } from "lucide-react";
import { useRef } from "react";

import type { Cma, Mapping } from "@/data/cma";
import type { Targets } from "@/data/targets";

import { importTargets, mapByName } from "@/actions/targets";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { SectionCard } from "@/components/app/molecules/section-card";
import { TargetTable } from "@/components/app/organisms/target-table";
import { Badge } from "@/components/kit/badge";
import { Button } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import { suggestedMappings } from "@/data/class-table";
import { useSender } from "@/hooks/use-sender";
import { formatDay } from "@/lib/months";
import { assumptions, subsectionLabel } from "@/lib/nav";
import { readTargets, taxonomy } from "@/lib/portfolio-file";

interface TargetAllocationProps {
  readonly cma: Cma | null;
  readonly mappings: readonly Mapping[];
  readonly targets: null | Targets;
}

// The assumptions screen's target allocation: the categories Portfolio
// Performance's Asset Allocation taxonomy holds, the share of the whole
// it sets each, and the class of the latest CMA each is mapped onto,
// which the rates derived from the CMA are blended from. The header says
// the day the targets were imported, and imports them again from a file
// chosen on this device, Portfolio Performance's own file as it saves
// it. The file is read here in the browser rather than sent, since it
// holds every holding and transaction beside the taxonomy and only the
// targets are wanted, so the store is sent the categories alone. The
// import holds while the file is read and the store asked, and the
// store's answer draws the screen again from the targets kept, under a
// toast. A file that cannot be read, or targets the store refuses, are
// said why under a toast, and nothing is kept. The picker is emptied as soon
// as a file is taken from it, so the same file chosen again, saved
// since, is read again. Before anything is imported there is no table
// to lay out, and the card says so. The footer states how a target is
// worked out and the check the targets pass before they are kept.
//
// While a category the CMA cannot blend has a class its name suggests,
// the header offers to map every such category by name, saying how many
// it would map. The mapping holds while it is on its way, and the
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
  const { isSending: isImporting, send } = useSender();
  const { isSending: isMapping, send: sendMapping } = useSender();
  const suggested =
    cma === null || targets === null
      ? 0
      : suggestedMappings(cma, targets, mappings).length;

  function mapNames(): void {
    sendMapping(mapByName, {
      failure: "Classes not mapped",
      success: (mapped) => ({
        description: `${String(mapped.length)} ${mapped.length === 1 ? "category" : "categories"} mapped onto the class its name suggests`,
        title: "Classes mapped by name",
      }),
    });
  }

  function take(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) {
      return;
    }
    send(
      async () =>
        importTargets(readTargets(new Uint8Array(await file.arrayBuffer()))),
      {
        failure: "Allocation not imported",
        success: (imported) => ({
          description: `From the ${taxonomy} taxonomy, as at ${formatDay(imported.importedOn)}`,
          title: "Target allocation imported",
        }),
      },
    );
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
              disabled={isMapping}
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
          <Button
            disabled={isImporting}
            onClick={() => {
              pickerRef.current?.click();
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
        {`A target is its class's weight times the weights of the classes above it in the ${taxonomy} taxonomy, and the targets are checked to add up to 100% before they are kept. The file is read in the browser, and only the targets leave it. Each category blends at the 20-year GBP return of its CMA class.`}
      </CardFooter>
    </SectionCard>
  );
}
