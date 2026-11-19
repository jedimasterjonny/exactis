import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import { Input as InputBase } from "@/components/ui/input";

// The registry's input, 44px tall on a touch screen, the height a finger
// needs; under a mouse it keeps the registry's height.
export function Input({
  className,
  ...props
}: Readonly<ComponentProps<typeof InputBase>>): JSX.Element {
  return (
    <InputBase
      className={cn("pointer-coarse:min-h-11", className)}
      {...props}
    />
  );
}
