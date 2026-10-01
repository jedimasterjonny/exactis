import type { JSX } from "react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { ProjectionPending } from "@/components/app/organisms/projection-chart";
import { dashboard, sectionLabel } from "@/lib/nav";

// What the dashboard shows while the store answers: its label and its
// title, less the age it has yet to read, and the chart's frame, which
// says what is being waited on. The badges, the assumptions and the
// tiles are not stood in for, so when the dashboard arrives they land
// around the frame and the frame moves down beneath the tiles. It sits
// in a route group of its own, so it stands in for the dashboard alone
// rather than for every screen beside it.
export default function Loading(): JSX.Element {
  return (
    <>
      <ScreenHeader
        label={sectionLabel(dashboard)}
        title={`${dashboard.title} …`}
      />
      <ScreenBody>
        <ProjectionPending />
      </ScreenBody>
    </>
  );
}
