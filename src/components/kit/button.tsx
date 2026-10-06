import type { ComponentProps, JSX } from "react";

import { cn } from "cn";
import { LoaderCircle } from "lucide-react";

import { Button as ButtonBase } from "@/components/ui/button";

export { buttonVariants } from "@/components/ui/button";

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
// stays natively disabled and does not spin.
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
