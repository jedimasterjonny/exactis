import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import { Card as CardBase } from "@/components/ui/card";

export {
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

// The registry's card draws its edge as a ring, which is a shadow, and
// forced colours draw no shadow and paint the card as the page, so the
// card would be lost against it. Under forced colours alone it draws an
// outline in the ring's place, which takes no room, so nothing moves
// and no other mode sees it.
export function Card({
  className,
  ...props
}: Readonly<ComponentProps<typeof CardBase>>): JSX.Element {
  return (
    <CardBase className={cn("forced-colors:outline", className)} {...props} />
  );
}
