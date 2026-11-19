import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import { NativeSelect as NativeSelectBase } from "@/components/ui/native-select";

export {
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";

// The registry's select, 44px tall on a touch screen, the height a
// finger needs; under a mouse it keeps the registry's height. A class
// given to it lands on the box around the select, so the select is
// reached as that box's child, and by a least height, which the small
// size's own height cannot undercut.
export function NativeSelect({
  className,
  ...props
}: Readonly<ComponentProps<typeof NativeSelectBase>>): JSX.Element {
  return (
    <NativeSelectBase
      className={cn("pointer-coarse:[&>select]:min-h-11", className)}
      {...props}
    />
  );
}
