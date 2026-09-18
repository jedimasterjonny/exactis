import type { LucideIcon } from "lucide-react";
import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import { Button } from "@/components/kit/button";

interface RowActionProps extends Readonly<
  Omit<
    ComponentProps<typeof Button>,
    "aria-label" | "children" | "size" | "variant"
  >
> {
  readonly icon: LucideIcon;
  readonly name: string;
  readonly tone?: Tone;
}

type Tone = "default" | "destructive";

// A destructive action is drawn faint and reddens under the pointer, so
// what it does is said before it is pressed rather than only in the
// dialog it opens.
const tones: Record<Tone, string | undefined> = {
  default: undefined,
  destructive: "text-muted-foreground hover:text-destructive",
};

// The action a row ends, or begins, with: an icon in a small ghost
// button, named by the row it acts on, since an icon alone says nothing
// to a screen reader and a column of identical pencils says nothing
// about which row it edits. The size and the variant are the atom's and
// not a caller's, which is the point of it; everything else a button
// takes passes through, so the grip that drags a row is this with drag
// handlers on it rather than a button written out again.
export function RowAction({
  className,
  icon,
  name,
  tone = "default",
  ...props
}: RowActionProps): JSX.Element {
  const Icon = icon;
  return (
    <Button
      aria-label={name}
      className={cn(tones[tone], className)}
      size="icon-sm"
      variant="ghost"
      {...props}
    >
      <Icon aria-hidden />
    </Button>
  );
}
