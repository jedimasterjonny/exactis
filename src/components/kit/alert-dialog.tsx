import type { ComponentProps, JSX } from "react";

import { Button } from "@/components/kit/button";

export {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// The action is the kit's button rather than the registry's, so a
// confirm can spin while what it confirms is on its way, as every other
// button here can. Upstream's action is the registry button with its
// slot named and nothing more, which is all this restores.
export function AlertDialogAction(
  props: ComponentProps<typeof Button>,
): JSX.Element {
  return <Button data-slot="alert-dialog-action" {...props} />;
}
