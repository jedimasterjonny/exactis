import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import {
  DropdownMenuContent as DropdownMenuContentBase,
  DropdownMenuItem as DropdownMenuItemBase,
} from "@/components/ui/dropdown-menu";

export {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The registry's menu, edged by an outline where colours are forced,
// since its ring is a shadow, which forcing does not draw, and its
// items rest unboxed there, so without an edge it would float as bare
// text. The outline's style is said again, since the registry's
// `outline-none` sets the one a bare outline reads to none.
export function DropdownMenuContent({
  className,
  ...props
}: Readonly<ComponentProps<typeof DropdownMenuContentBase>>): JSX.Element {
  return (
    <DropdownMenuContentBase
      className={cn(
        "forced-colors:outline forced-colors:outline-solid",
        className,
      )}
      {...props}
    />
  );
}

// The registry's menu item, 44px tall on a touch screen, the height a
// finger needs; under a mouse it keeps the registry's height. Where
// colours are forced the registry's item rests boxed in the text
// colour, which is the box the keyboard's focus draws, so its rest box
// is painted in the page's colour and only the focused item is boxed.
export function DropdownMenuItem({
  className,
  ...props
}: Readonly<ComponentProps<typeof DropdownMenuItemBase>>): JSX.Element {
  return (
    <DropdownMenuItemBase
      className={cn(
        "forced-colors:outline-[Canvas] pointer-coarse:min-h-11",
        className,
      )}
      {...props}
    />
  );
}
