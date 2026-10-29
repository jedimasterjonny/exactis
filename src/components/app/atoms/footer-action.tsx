import type { ComponentProps, JSX } from "react";

import { SidebarMenuButton } from "@/components/kit/sidebar";

type FooterActionProps = Readonly<
  Omit<ComponentProps<typeof SidebarMenuButton>, "className">
>;

// An action in the sidebar's footer: the registry's menu button in the
// footer's faint micro-label face, as the export, the import and
// sign-out are drawn. `text-xs` is spelled out beside `label`, which sets
// the same size, because the button carries `text-sm` and tailwind-merge
// cannot see into a utility, so only a size written out displaces it. The
// face is the atom's and not a caller's, which is the point of it;
// everything else the button takes passes through, so the export's menu
// renders its trigger as this and sign-out submits its form with it.
export function FooterAction(props: FooterActionProps): JSX.Element {
  return (
    <SidebarMenuButton
      {...props}
      className="-mx-2 label text-xs text-sidebar-foreground/60 [&_svg]:size-3.5"
    />
  );
}
