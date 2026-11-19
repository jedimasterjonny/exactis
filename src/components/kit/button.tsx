import type { ComponentProps, JSX } from "react";

import { cn } from "cn";
import { LoaderCircle } from "lucide-react";

import {
  Button as ButtonBase,
  buttonVariants as variantsOf,
} from "@/components/ui/button";

// At least 44px each way on a touch screen, the size a finger needs,
// whatever the button's size; under a mouse, the registry's sizes.
const touch = "pointer-coarse:min-h-11 pointer-coarse:min-w-11";

interface ButtonProps extends Readonly<ComponentProps<typeof ButtonBase>> {
  readonly isBusy?: boolean;
}

// The registry's button, which can say its action is running. A busy
// button spins in place of its own icon, or ahead of its label where it
// has none, so a pull that takes seconds shows that it is under way
// rather than only greying out. It stays focusable while it runs, which
// Base UI does by marking it aria-disabled rather than disabled, so the
// press that started the action does not drop a keyboard's focus on the
// page; Base UI still swallows its clicks, a form's Enter among them, and
// aria-busy says why it will not press. A button held for another reason
// stays natively disabled and does not spin. On a touch screen it is at
// least 44px each way.
export function Button({
  children,
  className,
  disabled: isDisabled,
  focusableWhenDisabled: isFocusableWhenDisabled,
  isBusy = false,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <ButtonBase
      aria-busy={isBusy || undefined}
      className={cn(
        touch,
        isBusy && "cursor-progress [&>svg:not([data-slot=spinner])]:hidden",
        className,
      )}
      disabled={isBusy || isDisabled}
      focusableWhenDisabled={isBusy || isFocusableWhenDisabled}
      {...props}
    >
      {isBusy && (
        <LoaderCircle
          aria-hidden
          className="animate-spin"
          data-slot="spinner"
        />
      )}
      {children}
    </ButtonBase>
  );
}

// The registry's classes for a link drawn as a button, at least 44px
// each way on a touch screen as a button is. The touch classes are
// added after the registry's rather than merged with them: a merge
// re-reads the registry's own classes and drops some, which would
// redraw every such link's corners and icon, under a mouse too.
export function buttonVariants(...args: Parameters<typeof variantsOf>): string {
  return `${variantsOf(...args)} ${touch}`;
}
