"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "Salvando…",
  variant = "default",
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "default" | "primary";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      aria-busy={pending}
      className={`btn ${variant === "primary" ? "btn-primary" : ""} ${className}`}
      {...rest}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
