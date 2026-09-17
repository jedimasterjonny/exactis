import type { JSX, ReactNode } from "react";

import { Field as FieldPrimitive } from "@base-ui/react/field";

interface FieldProps {
  readonly children: ReactNode;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly label: string;
}

// The scaffold every field in the product shares: a micro-label above, the
// control, and a hint beneath. Base UI's field wires the label and the hint
// to whatever control is passed as children, so a field carries its own
// accessibility and a caller supplies nothing but the control. The type is
// stated here rather than at each call site, so the form grammar has one
// place to change. A field given an error is invalid, which the control
// says of itself, and shows the error in the loss tone beneath the hint;
// the error is the caller's, from a store or an action, since the field
// validates nothing.
export function Field({
  children,
  error,
  hint,
  label,
}: FieldProps): JSX.Element {
  return (
    <FieldPrimitive.Root
      className="grid content-start gap-1.5"
      invalid={error !== undefined}
    >
      <FieldPrimitive.Label className="label text-muted-foreground">
        {label}
      </FieldPrimitive.Label>
      {children}
      {hint !== undefined && (
        <FieldPrimitive.Description className="text-xs text-muted-foreground">
          {hint}
        </FieldPrimitive.Description>
      )}
      {error !== undefined && (
        <FieldPrimitive.Error className="text-xs text-destructive" match>
          {error}
        </FieldPrimitive.Error>
      )}
    </FieldPrimitive.Root>
  );
}
