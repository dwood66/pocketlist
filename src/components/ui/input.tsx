import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        // text-base (16px) on small screens is deliberate: iOS Safari zooms the
        // whole page on focus for any input under 16px. sm:text-sm restores the
        // tighter size once there's a pointer and no auto-zoom.
        "flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-base sm:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
