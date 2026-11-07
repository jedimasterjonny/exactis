import type { JSX } from "react";

import { Suspense, use } from "react";

import type { Opened } from "@/store/household";

import { PhoneNav } from "@/components/app/molecules/phone-nav";
import { ScenarioBanner } from "@/components/app/molecules/scenario-banner";
import { AppSidebar } from "@/components/app/organisms/app-sidebar";
import { AppFrame } from "@/components/app/templates/app-frame";
import { getOpened, isCloseDue } from "@/store/household";

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
// error screen in place of the screen and the banner both. The frame is
// handed the phone's tab bar as well, along the foot of the screen below
// the md breakpoint. Whether last month is still to be closed is read the
// same way, once, for the sidebar's navigation and the tab bar both to
// badge the month end. The tab bar is drawn as an element apiece for the
// frame and the boundary, where the sidebar is one shared by both: the
// bar sits in the frame's row of children, and an element shared with
// the boundary's props reaches the browser as the one the props carried,
// unchecked for a key in that row, so React warns of a missing one.
export default function AppLayout({ children }: LayoutProps<"/">): JSX.Element {
  const isDue = isCloseDue();
  const sidebar = <AppSidebar isDue={isDue} />;
  return (
    <FrameCatch nav={<PhoneNav isDue={isDue} />} sidebar={sidebar}>
      <AppFrame
        banner={
          <Suspense fallback={null}>
            <OpenScenario scenario={getOpened()} />
          </Suspense>
        }
        nav={<PhoneNav isDue={isDue} />}
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
