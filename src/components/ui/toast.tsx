"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { cn } from "cn";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

const toast = ToastPrimitive.createToastManager();

function Toast({
  className,
  ...props
}: Readonly<ToastPrimitive.Root.Props>): React.JSX.Element {
  return (
    <ToastPrimitive.Root
      className={cn(
        "group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-2xl border bg-popover text-popover-foreground shadow-lg will-change-transform outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]",
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-limited:opacity-0 data-starting-style:[transform:translateY(150%)]",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        className,
      )}
      data-slot="toast"
      {...props}
    />
  );
}

function ToastAction({
  className,
  ...props
}: Readonly<ToastPrimitive.Action.Props>): React.JSX.Element {
  return (
    <ToastPrimitive.Action
      className={cn("shrink-0", className)}
      data-slot="toast-action"
      render={<Button size="sm" variant="outline" />}
      {...props}
    />
  );
}

function ToastClose({
  className,
  ...props
}: Readonly<ToastPrimitive.Close.Props>): React.JSX.Element {
  return (
    <ToastPrimitive.Close
      aria-label="Close toast"
      className={cn(
        "relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground",
        className,
      )}
      data-slot="toast-close"
      render={<Button size="icon-sm" variant="ghost" />}
      {...props}
    >
      <XIcon aria-hidden="true" />
    </ToastPrimitive.Close>
  );
}

function ToastContent({
  className,
  ...props
}: Readonly<ToastPrimitive.Content.Props>): React.JSX.Element {
  return (
    <ToastPrimitive.Content
      className={cn(
        "flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100",
        className,
      )}
      data-slot="toast-content"
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: Readonly<ToastPrimitive.Description.Props>): React.JSX.Element {
  return (
    <ToastPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      data-slot="toast-description"
      {...props}
    />
  );
}

function Toaster({
  children,
  toastManager = toast,
  ...props
}: Readonly<ToastPrimitive.Provider.Props>): React.JSX.Element {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

function ToastIcon({
  type,
}: Readonly<{ type: string | undefined }>): null | React.JSX.Element {
  let icon: React.ReactNode = null;

  if (type === "success") {
    icon = <CircleCheckIcon aria-hidden="true" />;
  }

  if (type === "info") {
    icon = <InfoIcon aria-hidden="true" />;
  }

  if (type === "warning") {
    icon = <TriangleAlertIcon aria-hidden="true" />;
  }

  if (type === "error") {
    icon = <OctagonXIcon aria-hidden="true" className="text-destructive" />;
  }

  if (type === "loading") {
    icon = <Loader2Icon aria-hidden="true" className="animate-spin" />;
  }

  if (!icon) {
    return null;
  }

  return (
    <span
      className="shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4"
      data-slot="toast-icon"
    >
      {icon}
    </span>
  );
}

function ToastList(): React.JSX.Element[] {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

function ToastPortal({
  ...props
}: Readonly<ToastPrimitive.Portal.Props>): React.JSX.Element {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

function ToastProvider({
  ...props
}: Readonly<ToastPrimitive.Provider.Props>): React.JSX.Element {
  return <ToastPrimitive.Provider {...props} />;
}

function ToastTitle({
  className,
  ...props
}: Readonly<ToastPrimitive.Title.Props>): React.JSX.Element {
  return (
    <ToastPrimitive.Title
      className={cn("text-sm font-medium", className)}
      data-slot="toast-title"
      {...props}
    />
  );
}

function ToastViewport({
  className,
  ...props
}: Readonly<ToastPrimitive.Viewport.Props>): React.JSX.Element {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto w-auto max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full",
        className,
      )}
      data-slot="toast-viewport"
      {...props}
    />
  );
}

export { toast, Toaster };
