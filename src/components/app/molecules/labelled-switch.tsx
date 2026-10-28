import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import { cn } from "cn";

import { Switch } from "@/components/kit/switch";

interface LabelledSwitchProps {
  readonly children: string;
  readonly className?: string | undefined;
  readonly icon: LucideIcon;
  readonly isChecked: boolean;
  readonly onCheckedChange: (isChecked: boolean) => void;
  readonly tone?: Tone;
}

type Tone = "default" | "sidebar";

// The sidebar's ink takes the faint foreground for its labels, and the
// switch fills with the sidebar's oxide when on, since the registry's
// primary fill is ink, which vanishes on the ink sidebar.
const tones: Record<
  Tone,
  { readonly label: string; readonly switch: string | undefined }
> = {
  default: { label: "text-muted-foreground", switch: undefined },
  sidebar: {
    label: "text-sidebar-foreground/60",
    switch: "data-checked:bg-sidebar-primary",
  },
};

// A switch between two states, named: an icon and the name of the state
// the switch is in now, in the micro-label face, with the switch at the
// right. The name is the switch's accessible name, since the label wraps
// it, so a caller names the state and never the control.
export function LabelledSwitch({
  children,
  className,
  icon,
  isChecked,
  onCheckedChange,
  tone = "default",
}: LabelledSwitchProps): JSX.Element {
  const Icon = icon;
  return (
    <label
      className={cn(
        "flex h-8 items-center gap-2 label",
        tones[tone].label,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      <span className="flex-1">{children}</span>
      <Switch
        checked={isChecked}
        className={tones[tone].switch}
        onCheckedChange={onCheckedChange}
        size="sm"
      />
    </label>
  );
}
