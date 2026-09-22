import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "icon";
export type ButtonState = "default" | "active" | "disabled";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; state?: ButtonState; icon?: ReactNode; }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", state = "default", icon, children, className = "", disabled, type = "button", ...props }, ref) {
  const isDisabled = disabled || state === "disabled";
  return <button ref={ref} type={type} className={`ui-button ui-button-${variant} ${className}`.trim()} data-state={isDisabled ? "disabled" : state} disabled={isDisabled} {...props}>{icon ? <span aria-hidden="true">{icon}</span> : null}{children}</button>;
});
