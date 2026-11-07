import type { JSX } from "react";

import { LogOut } from "lucide-react";

import { signOut } from "@/actions/auth";
import { FooterAction } from "@/components/app/atoms/footer-action";
import { AppNav } from "@/components/app/molecules/app-nav";
import { ExportMenu } from "@/components/app/molecules/export-menu";
import { HouseholdImport } from "@/components/app/organisms/household-import";
import { ThemeToggle } from "@/components/app/organisms/theme-toggle";
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/kit/sidebar";

interface AppSidebarProps {
  readonly isDue: Promise<boolean>;
}

// What the shell's sidebar holds: the wordmark, the navigation, the theme
// toggle, export and import, sign-out and the motto. The navigation is
// handed the read of whether last month is still to be closed, for its
// badge. Sign-out is a form
// posting to its action, so it works before the page hydrates and needs
// no client code of its own. Its button is the registry's, so hover and
// focus come from where the navigation's do, but the footer's micro-label
// type is laid back over it: this row reads with the motto below it, not
// the navigation above. The export and the import above sign-out are
// drawn as the same button: the export a menu of the two files the route
// hands out, and the import asking before a file replaces what is open.
// The footer clears the home indicator, which the sidebar runs down to.
// In the phone's sheet the wordmark, the screens and the footer sit
// together at its foot, where a thumb reaches, and the space left over
// is above the wordmark rather than between it and the screens it heads.
// The screens take only their own height there, so the wordmark can sit
// on them; the list still scrolls if a phone is too short for all three.
export function AppSidebar({ isDue }: AppSidebarProps): JSX.Element {
  return (
    <>
      <SidebarHeader className="px-4 pt-5 pb-4 max-md:mt-auto">
        <span className="flex items-center gap-2 font-heading text-lg font-bold tracking-[-0.03em] uppercase">
          Exactis
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-sidebar-primary"
          />
        </span>
      </SidebarHeader>
      <SidebarContent className="px-2 max-md:flex-initial">
        <AppNav isDue={isDue} />
      </SidebarContent>
      <SidebarFooter className="gap-3 px-4 pb-[calc(--spacing(5)+env(safe-area-inset-bottom))]">
        <ThemeToggle />
        <ExportMenu />
        <HouseholdImport />
        <form action={signOut} aria-label="Sign out">
          <FooterAction type="submit">
            <LogOut aria-hidden />
            Sign out
          </FooterAction>
        </form>
        {/* The one Latin motto, and the whole of the 40k licence. */}
        <span className="label text-sidebar-foreground/60">
          Certitudo in numeris
        </span>
      </SidebarFooter>
    </>
  );
}
