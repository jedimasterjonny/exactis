import type { JSX } from "react";

import { Suspense, use } from "react";

import type { Opened } from "@/store/household";

import { ScenarioBanner } from "@/components/app/molecules/scenario-banner";
import { AppSidebar } from "@/components/app/organisms/app-sidebar";
import { AppFrame } from "@/components/app/templates/app-frame";
import { getOpened } from "@/store/household";

interface OpenScenarioProps {
  readonly scenario: Promise<null | Opened>;
}

// The signed-in screens share the frame, handed the sidebar with the
// navigation and the banner that heads the main column beside it while a
// scenario is open, so no screen is edited without saying which household
// it saves to. The login screen sits outside this group, so it never shows
// a sidebar to someone who cannot use it. Which scenario is open is read
// from the request's cookie, so the read waits for the request behind a
// boundary of its own that stands in nothing, and the frame and the screen
// beneath it never wait on it: the layout starts the read and hands the
// promise down rather than awaiting it.
export default function AppLayout({ children }: LayoutProps<"/">): JSX.Element {
  return (
    <AppFrame
      banner={
        <Suspense fallback={null}>
          <OpenScenario scenario={getOpened()} />
        </Suspense>
      }
      sidebar={<AppSidebar />}
    >
      {children}
    </AppFrame>
  );
}

// The banner naming the scenario open, or nothing while the household
// is.
function OpenScenario({ scenario }: OpenScenarioProps): JSX.Element | null {
  const opened = use(scenario);
  return opened === null ? null : <ScenarioBanner {...opened} />;
}
