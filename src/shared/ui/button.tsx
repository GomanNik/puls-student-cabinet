import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";

export function Button({ asChild = false, variant = "primary", className = "", ...props }:
  ComponentProps<"button"> & { asChild?: boolean; variant?: "primary" | "secondary" | "quiet" }) {
  const Component = asChild ? Slot : "button";
  return <Component className={`button button-${variant} ${className}`} {...props} />;
}
