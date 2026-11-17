import type { JSX } from "react";

import { CalendarCheck } from "lucide-react";
import Link from "next/link";

import { Screen } from "@/components/app/templates/screen";
import { buttonVariants } from "@/components/kit/button";
import { accountsAndAssets, monthEnd, sectionLabel } from "@/lib/nav";

// What the accounts screen shows while the store answers: its header,
// which the shell can carry, with the link to the month end it lands
// with, since the link needs nothing read, so the header is the height
// it lands at where the link wraps beneath the title; and nothing
// beneath until there are rows.
export default function Loading(): JSX.Element {
  return (
    <Screen
      actions={
        <Link className={buttonVariants({ size: "sm" })} href={monthEnd.href}>
          <CalendarCheck aria-hidden />
          Update balances
        </Link>
      }
      label={sectionLabel(accountsAndAssets)}
      meta="Reading the store…"
      title={accountsAndAssets.title}
    />
  );
}
