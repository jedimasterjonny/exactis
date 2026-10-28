"use client";

import type { JSX } from "react";

import { Plus, TrendingDown } from "lucide-react";
import { useState } from "react";

import type { Plan } from "@/data/plan";
import type { Allocation, Anchor } from "@/data/rates";

import { removeAnchor, saveAnchor } from "@/actions/plan";
import { FieldRow } from "@/components/app/atoms/field-row";
import { AgeField } from "@/components/app/molecules/age-field";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { RateField } from "@/components/app/molecules/figure-field";
import { RowActions } from "@/components/app/molecules/row-actions";
import { EditDialog } from "@/components/app/organisms/edit-dialog";
import { GlideChart } from "@/components/app/organisms/glide-chart";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { ageIn, oldestAge, yearAt } from "@/data/plan";
import { bondsAt } from "@/data/rates";
import { useSender } from "@/hooks/use-sender";
import { formatPercent } from "@/lib/money";
import { assumptions, subsectionLabel } from "@/lib/nav";

interface GlidePathProps {
  readonly glide: readonly Anchor[];
  readonly plan: Plan;
  readonly split: Allocation;
}

// The anchor open in the dialog: as it is drafted, and the age it was
// saved at, which names it among the rest, or none for a new one.
interface Opened {
  readonly draft: Anchor;
  readonly savedAt: null | number;
}

// The assumptions screen's glide path: the share of the savings held in
// bonds by age, set by anchors and drawn over the plan's years, with
// the anchors listed beneath, each its age, the year it falls in and its
// bond share, and a pencil and a bin. A button in the header adds one.
// The plan holds an anchor's split at its age, the straight line
// between two between them, and the nearest anchor's beyond them, under
// whichever rates are live, setting the split typed aside; a household
// with no anchors holds the one split for life, and the card says so in
// place of the chart and the table.
//
// An anchor is two figures, so its dialog is the age beside the bond
// share, the age typed with no slider, since it is set on purpose. A
// new one opens at the owner's age now and the share in bonds the plan
// holds there, the path's or, before it has any anchor, the one split
// it holds for life, so a first anchor saved as it opened moves nothing.
// An anchor is saved alone, in place of the one at the age it opened
// at, since an edit can move it, so the store lays it over the path as
// it holds it: the dialog stays open with its save held until the store
// answers, then closes onto the page re-read, under a toast, or stays
// open and says why under a toast, as when the age already holds an
// anchor. A bin asks first, as every bin does, and is answered the same
// way.
export function GlidePath({ glide, plan, split }: GlidePathProps): JSX.Element {
  const [opened, setOpened] = useState<null | Opened>(null);
  const [doomed, setDoomed] = useState<Anchor | null>(null);
  const { isSending, send } = useSender();
  const now = ageIn(plan.from, plan);

  function save({ draft, savedAt }: Opened): void {
    send(async () => saveAnchor(savedAt, draft), {
      failure: "Anchor not saved",
      onAccepted: () => {
        setOpened(null);
      },
      success: (saved) => ({
        description: `${formatPercent(saved.bonds)} in bonds`,
        title: `${nameOf(saved)} saved`,
      }),
    });
  }

  function remove(anchor: Anchor): void {
    send(async () => removeAnchor(anchor.age), {
      failure: "Anchor not deleted",
      onAccepted: () => {
        setDoomed(null);
      },
      success: () => ({
        description: `${formatPercent(anchor.bonds)} in bonds`,
        title: `${nameOf(anchor)} deleted`,
      }),
    });
  }

  return (
    <>
      <SectionCard
        actions={
          <Button
            onClick={() => {
              setOpened({
                draft: {
                  age: now,
                  bonds: bondsAt(glide, now) ?? 1 - split.stocks,
                },
                savedAt: null,
              });
            }}
            size="sm"
            variant="outline"
          >
            <Plus aria-hidden />
            Add anchor
          </Button>
        }
        caption="The share in bonds by age. Straight between anchors and flat beyond them, in place of the split set with the rates."
        className="pb-0"
        label={subsectionLabel(assumptions, 4)}
        title="Glide path"
      >
        {glide.length === 0 ? (
          <EmptyState
            description="Add an anchor to set the bond share by age. Until then the plan holds the one split for life."
            icon={TrendingDown}
            title="No glide path yet"
          />
        ) : (
          <>
            <CardContent>
              <GlideChart glide={glide} plan={plan} />
            </CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Age</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Bonds</TableHead>
                  <TableHead className="w-px">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {glide.map((anchor) => (
                  <TableRow key={anchor.age}>
                    <TableCell className="figure">{anchor.age}</TableCell>
                    <TableCell className="figure text-muted-foreground">
                      {yearAt(anchor.age, plan)}
                    </TableCell>
                    <TableCell className="text-right figure">
                      {formatPercent(anchor.bonds)}
                    </TableCell>
                    <TableCell className="w-px py-1">
                      <RowActions
                        name={nameOf(anchor).toLowerCase()}
                        onDelete={setDoomed}
                        onEdit={(row) => {
                          setOpened({ draft: row, savedAt: row.age });
                        }}
                        row={anchor}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </SectionCard>
      {opened !== null && (
        <EditDialog
          eyebrow={opened.savedAt === null ? "New anchor" : "Edit anchor"}
          isSaving={isSending}
          onDismiss={() => {
            setOpened(null);
          }}
          onSave={() => {
            save(opened);
          }}
          title={nameOf(opened.draft)}
        >
          <FieldRow layout="pair">
            <AgeField
              hasSlider={false}
              label="Age"
              max={oldestAge}
              min={0}
              onValueCommitted={(age) => {
                setOpened({ ...opened, draft: { ...opened.draft, age } });
              }}
              value={opened.draft.age}
            />
            <RateField
              hint="The rest in equities"
              label="Bonds"
              max={1}
              min={0}
              onValueCommitted={(bonds) => {
                setOpened({ ...opened, draft: { ...opened.draft, bonds } });
              }}
              value={opened.draft.bonds}
            />
          </FieldRow>
        </EditDialog>
      )}
      {doomed !== null && (
        <ConfirmDialog
          isBusy={isSending}
          onCancel={() => {
            setDoomed(null);
          }}
          onConfirm={() => {
            remove(doomed);
          }}
          title={`Delete the ${nameOf(doomed).toLowerCase()}?`}
        >
          The plan holds the path through the anchors left.
        </ConfirmDialog>
      )}
    </>
  );
}

// How an anchor is named, in a row's actions, a dialog and a toast.
function nameOf({ age }: Pick<Anchor, "age">): string {
  return `Anchor at ${String(age)}`;
}
