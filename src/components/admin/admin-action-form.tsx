"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import type { AdminActionResult } from "@/types/admin";
import { cn } from "@/lib/utils";

const initialState: AdminActionResult = { ok: false, message: "" };

export function AdminActionForm({
  action,
  children,
  className,
  submitLabel = "Сохранить",
  submitVariant = "default",
}: {
  action: (state: AdminActionResult, formData: FormData) => Promise<AdminActionResult>;
  children?: React.ReactNode;
  className?: string;
  submitLabel?: string;
  submitVariant?: ButtonProps["variant"];
}) {
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={formAction} className={cn("flex flex-col gap-3", className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={submitLabel} variant={submitVariant} />
        {state.message ? (
          <p
            aria-live="polite"
            className={cn(
              "text-sm",
              state.ok ? "text-success" : "text-danger",
            )}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function SubmitButton({
  label,
  variant,
}: {
  label: string;
  variant: ButtonProps["variant"];
}) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant={variant}>
      {pending ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
      {pending ? "Выполняется…" : label}
    </Button>
  );
}
