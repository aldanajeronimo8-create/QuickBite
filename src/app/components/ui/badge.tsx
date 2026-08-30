import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]/40 transition-[color,background-color,border-color,box-shadow] overflow-hidden backdrop-blur-xl",
  {
    variants: {
      variant: {
        default: "border-[#FF5A36]/30 bg-[#FF5A36]/15 text-[#FFB19D] shadow-[0_0_18px_rgba(255,90,54,0.12)]",
        secondary: "border-white/10 bg-white/[0.08] text-slate-200",
        destructive: "border-red-400/25 bg-red-400/15 text-red-200",
        outline: "border-white/15 bg-white/[0.04] text-slate-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
