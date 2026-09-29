import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import { Alert as AlertBase } from "@/components/ui/alert";

interface AlertProps extends Readonly<
  Omit<ComponentProps<typeof AlertBase>, "variant">
> {
  readonly variant?: BaseVariant | Tone;
}

type BaseVariant = NonNullable<ComponentProps<typeof AlertBase>["variant"]>;

type Tone = "caution";

// The tone base-nova does not ship, backed by the --caution token in
// globals.css as badge's is: caution for changed assumptions, drawn in
// the token on a tint of it, the description a step fainter.
const tones: Record<Tone, string> = {
  caution:
    "border-caution/30 bg-caution/10 text-caution *:data-[slot=alert-description]:text-caution/90 dark:bg-caution/20",
};

// A tone is passed as variant={null} rather than layered over one of
// upstream's, as badge's are: null makes the vendored cva emit its base
// classes and no variant classes, so nothing has to be won back through
// tailwind-merge.
export function Alert({
  className,
  variant = "default",
  ...props
}: AlertProps): JSX.Element {
  if (variant === "caution") {
    return (
      <AlertBase
        className={cn(tones[variant], className)}
        variant={null}
        {...props}
      />
    );
  }
  return <AlertBase className={className} variant={variant} {...props} />;
}

export { AlertDescription, AlertTitle } from "@/components/ui/alert";
