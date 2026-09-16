import type { JSX } from "react";

import { AppFrame } from "@/components/app/app-frame";

// The signed-in screens share the frame: the sidebar with the navigation
// and the main column beside it. The login screen sits outside this group,
// so it never shows a sidebar to someone who cannot use it.
export default function AppLayout({ children }: LayoutProps<"/">): JSX.Element {
  return <AppFrame>{children}</AppFrame>;
}
