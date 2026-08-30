import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 hover:scale-[1.02] active:scale-[0.99] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]/60 focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-[#FF5A36] to-[#ff7a5d] text-white shadow-[0_8px_24px_rgba(255,90,54,0.22)] hover:shadow-[0_10px_30px_rgba(255,90,54,0.34)]",
        destructive: "bg-red-500/85 text-white shadow-[0_8px_24px_rgba(239,68,68,0.18)] hover:bg-red-500",
        outline: "border border-white/15 bg-white/[0.06] text-white backdrop-blur-xl hover:bg-white/[0.1] hover:border-white/25",
        secondary: "border border-white/10 bg-white/[0.08] text-slate-100 backdrop-blur-xl hover:bg-white/[0.12]",
        ghost: "text-slate-200 hover:bg-white/[0.08] hover:text-white",
        link: "text-[#FF8A70] underline-offset-4 hover:text-[#FFB19D] hover:underline hover:scale-100",
      },
      size: {
        default: "h-10 px-4 has-[>svg]:px-3",
        sm: "h-9 rounded-xl gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-xl px-6 has-[>svg]:px-4",
        icon: "size-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
