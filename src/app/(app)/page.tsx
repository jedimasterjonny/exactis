import type { JSX } from "react";

import { Suspense } from "react";

import { Dashboard, DashboardPending } from "./dashboard";

// The dashboard reads the store from its header down, since the header
// is titled with the age the plan runs to, so the whole of it streams
// in behind the pending frame rather than the chart alone.
export default function Home(): JSX.Element {
  return (
    <Suspense fallback={<DashboardPending />}>
      <Dashboard />
    </Suspense>
  );
}
