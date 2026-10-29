import type { JSX } from "react";

import { Suspense, use } from "react";

import type { Opened } from "@/store/household";

import { ScenarioBanner } from "@/components/app/molecules/scenario-banner";
import { AppSidebar } from "@/components/app/organisms/app-sidebar";
import { AppFrame } from "@/components/app/templates/app-frame";
import { getOpened } from "@/store/household";

import { FrameCatch } from "./frame-catch";

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
// promise down rather than awaiting it. The read sits above the screens'
// error boundary, which catches nothing this layout throws, so a read
// that fails is caught around the frame, which is drawn again with the
// error screen in place of the screen and the banner both.
export default function AppLayout({ children }: LayoutProps<"/">): JSX.Element {
  const sidebar = <AppSidebar />;
  return (
    <FrameCatch sidebar={sidebar}>
      <AppFrame
        banner={
          <Suspense fallback={null}>
            <OpenScenario scenario={getOpened()} />
          </Suspense>
        }
        sidebar={sidebar}
      >
        {children}
      </AppFrame>
    </FrameCatch>
  );
}

// The banner naming the scenario open, or nothing while the household
// is.
function OpenScenario({ scenario }: OpenScenarioProps): JSX.Element | null {
  const opened = use(scenario);
  return opened === null ? null : <ScenarioBanner {...opened} />;
}
