import type { VariantProps } from "class-variance-authority";
import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import type { badgeVariants } from "@/components/ui/badge";

import { Badge as BadgeBase } from "@/components/ui/badge";

interface BadgeProps extends Readonly<
  Omit<ComponentProps<typeof BadgeBase>, "variant">
> {
  readonly variant?: BaseVariant | Tone;
}

type BaseVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

type Tone = "caution" | "positive";

// Two tones base-nova does not ship, backed by the --positive and
// --caution tokens in globals.css: positive for gains and funded goals,
// caution for stale data and changed assumptions. They used to be entries
// in the vendored cva, which is why every update had to re-add them by
// hand; here they survive an overwrite untouched.
const tones: Record<Tone, string> = {
  caution:
    "bg-caution/10 text-caution focus-visible:ring-caution/20 dark:bg-caution/20 dark:focus-visible:ring-caution/40 [a]:hover:bg-caution/20",
  positive:
    "bg-positive/10 text-positive focus-visible:ring-positive/20 dark:bg-positive/20 dark:focus-visible:ring-positive/40 [a]:hover:bg-positive/20",
};

// A tone is passed as variant={null} rather than layered over one of
// upstream's: null makes the vendored cva emit its base classes and no
// variant classes, so nothing has to be won back through tailwind-merge.
// data-variant is then restored by hand, because it is read by tests and
// is the tone's name rather than the one upstream would infer.
export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps): JSX.Element {
  if (isTone(variant)) {
    return (
      <BadgeBase
        className={cn(tones[variant], className)}
        data-variant={variant}
        variant={null}
        {...props}
      />
    );
  }
  return <BadgeBase className={className} variant={variant} {...props} />;
}

function isTone(variant: BaseVariant | Tone): variant is Tone {
  return variant === "caution" || variant === "positive";
}
