import type { PlanAges } from "@/data/plan";
import type { Database } from "@/db/accounts";

import { plan } from "@/db/schema";

// The ages the plan is set to. The migration that made the table wrote
// its one row, so a store with none is a store the migrations have not
// reached, which is a mistake rather than a plan with no ages.
export async function findAges(db: Database): Promise<PlanAges> {
  const [row] = await db
    .select({ ends: plan.ends, retires: plan.retires })
    .from(plan)
    .limit(1);
  if (row === undefined) {
    throw new Error("The plan has no row");
  }
  return row;
}

// The plan's ages, written over the ones it had. There is one row, so
// the write names none.
export async function writeAges(
  db: Database,
  ages: PlanAges,
): Promise<PlanAges> {
  const [row] = await db
    .update(plan)
    .set(ages)
    .returning({ ends: plan.ends, retires: plan.retires });
  if (row === undefined) {
    throw new Error("The plan has no row");
  }
  return row;
}
