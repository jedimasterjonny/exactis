import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import { DropdownMenuItem as DropdownMenuItemBase } from "@/components/ui/dropdown-menu";

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The registry's menu item, 44px tall on a touch screen, the height a
// finger needs; under a mouse it keeps the registry's height.
export function DropdownMenuItem({
  className,
  ...props
}: Readonly<ComponentProps<typeof DropdownMenuItemBase>>): JSX.Element {
  return (
    <DropdownMenuItemBase
      className={cn("pointer-coarse:min-h-11", className)}
      {...props}
    />
  );
}
