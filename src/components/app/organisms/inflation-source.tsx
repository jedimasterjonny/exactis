"use client";

import type { JSX } from "react";

import { Download, Landmark } from "lucide-react";
import { useId } from "react";

import type { Curve } from "@/data/inflation";

import { pullCurve } from "@/actions/inflation";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { SectionCard } from "@/components/app/molecules/section-card";
import { Badge } from "@/components/kit/badge";
import { Button } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import {
  horizon,
  inflationOf,
  maturities,
  rpiAligned,
  rpiWedge,
} from "@/data/inflation";
import { useSender } from "@/hooks/use-sender";
import { formatCurveRate, formatPercent, formatPoints } from "@/lib/money";
import { formatDay, monthName } from "@/lib/months";
import { assumptions, subsectionLabel } from "@/lib/nav";

interface InflationSourceProps {
  readonly curve: Curve | null;
}

interface StepProps {
  readonly detail: string;
  readonly figure: string;
  readonly label: string;
}

// The assumptions screen's inflation card: the rate the gilt market
// gives and how it is derived, which the plan does not take, since it
// runs on the inflation typed into its rates, and which is here to check
// that against. The header names the source and pulls the Bank's latest
// curve; the pull holds while it is on its way, and the store's answer
// draws the screen again from the curve kept, with a toast saying what
// it derives, or says why under a toast when the Bank or its file is
// refused. Beneath, the steps from the curve to the derived rate are
// laid out as a ledger, each figure with what it rests on beneath its
// name: the implied rate at the horizon on the curve's day, the share
// of RPI's wedge the years before 2030 carry, and the premium held for
// protection, with the derived rate closing the ledger. Beside them the
// curve at each maturity it is read at, the horizon's point in the
// foreground, since it is the one derived from. Before a curve has been
// pulled there are no steps to lay out, and the card says so. The
// footer states the check a curve passes before it is kept, since that
// is what the figures rest on.
export function InflationSource({ curve }: InflationSourceProps): JSX.Element {
  const { isSending: isPulling, send } = useSender();

  function pull(): void {
    send(pullCurve, {
      failure: "Curve not pulled",
      success: (pulled) => ({
        description: `As at ${formatDay(pulled.asOf)}, derived inflation ${formatPercent(inflationOf(pulled).rate)}`,
        title: "Curve pulled",
      }),
    });
  }

  return (
    <SectionCard
      actions={
        <>
          <Badge className="label" variant="secondary">
            <Landmark aria-hidden />
            BoE implied curve
          </Badge>
          <Button
            disabled={isPulling}
            onClick={pull}
            size="sm"
            variant="outline"
          >
            <Download aria-hidden />
            Pull latest curve
          </Button>
        </>
      }
      label={subsectionLabel(assumptions, 2)}
      title="Inflation source"
    >
      <CardContent>
        {curve === null ? (
          <EmptyState
            description="Pull the latest curve to derive inflation from the gilt market, as a check on the rate the plan is set to."
            icon={Landmark}
            title="No curve pulled yet"
          />
        ) : (
          <Derivation curve={curve} />
        )}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Nominal − real = implied is checked on every maturity before the curve
        is used; a mis-parse shows up immediately.
      </CardFooter>
    </SectionCard>
  );
}

// The curve at each maturity it is read at, on a sunken panel headed as
// a region of its own, the horizon's point in the foreground and the
// rest muted, and the source beneath.
function ByMaturity({ curve }: { readonly curve: Curve }): JSX.Element {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 self-start rounded-lg bg-muted p-5"
    >
      <h3 className="label text-muted-foreground" id={id}>
        Curve, by maturity
      </h3>
      <dl className="grid gap-3">
        {maturities.map((years) => {
          const tone = years === horizon ? undefined : "text-muted-foreground";
          return (
            <div className="flex justify-between gap-4 figure" key={years}>
              <dt className={tone}>{`${String(years)}y`}</dt>
              <dd className={tone}>{formatCurveRate(curve.implied[years])}</dd>
            </div>
          );
        })}
      </dl>
      <p className="text-sm text-muted-foreground">
        {`Source: Bank of England implied inflation (gilt) curve. The ${String(horizon)}-year point is the one derived from.`}
      </p>
    </section>
  );
}

// The steps from the curve to the derived rate beside the curve they
// start from, side by side where the card is wide enough and the curve
// beneath where it is not.
function Derivation({ curve }: { readonly curve: Curve }): JSX.Element {
  const inflation = inflationOf(curve);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="grid content-start">
        <ul className="divide-y border-b">
          <Step
            detail={`Gilt curve as at ${formatDay(curve.asOf)}`}
            figure={formatCurveRate(inflation.implied)}
            label={`BoE implied inflation, ${String(horizon)}-year`}
          />
          <Step
            detail={`${inflation.years.toFixed(2)} / ${String(horizon)} of the ${formatPoints(rpiWedge, 2)} wedge`}
            figure={formatPoints(-inflation.wedge)}
            label={`RPI → CPIH wedge, pre-${monthName(rpiAligned.month, "short")}-${String(rpiAligned.year)} share`}
          />
          <Step
            detail="Standing assumption"
            figure={formatPoints(-inflation.premium)}
            label="Inflation risk premium"
          />
        </ul>
        <p className="flex items-baseline justify-between gap-4 pt-6">
          <span className="label text-muted-foreground">Derived inflation</span>
          <span className="figure text-3xl font-medium">
            {formatPercent(inflation.rate)}
          </span>
        </p>
      </div>
      <ByMaturity curve={curve} />
    </div>
  );
}

// A step of the ledger: its name and, beneath it, what the figure rests
// on; the figure to the right.
function Step({ detail, figure, label }: StepProps): JSX.Element {
  return (
    <li className="flex items-baseline justify-between gap-4 py-4 first:pt-0">
      <span className="grid gap-1">
        <span>{label}</span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </span>
      <span className="figure">{figure}</span>
    </li>
  );
}
