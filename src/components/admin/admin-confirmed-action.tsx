"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { AdminActionResult } from "@/types/admin";

const initialState: AdminActionResult = { ok: false, message: "" };

export function AdminConfirmedAction({
  action,
  children,
  confirmLabel,
  description,
  title,
  triggerIcon,
  triggerIconOnly = false,
  triggerLabel,
  triggerVariant = "secondary",
}: {
  action: (state: AdminActionResult, formData: FormData) => Promise<AdminActionResult>;
  children?: React.ReactNode;
  confirmLabel: string;
  description: string;
  title: string;
  triggerIcon?: React.ReactNode;
  triggerIconOnly?: boolean;
  triggerLabel: string;
  triggerVariant?: ButtonProps["variant"];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async (previousState: AdminActionResult, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.ok) setOpen(false);
    return result;
  }, initialState);

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button
          aria-label={triggerIconOnly ? triggerLabel : undefined}
          className={triggerIconOnly ? "size-11 sm:size-9" : undefined}
          size={triggerIconOnly ? "icon" : "sm"}
          title={triggerIconOnly ? triggerLabel : undefined}
          type="button"
          variant={triggerVariant}
        >
          {triggerIcon}
          {triggerIconOnly ? <span className="sr-only">{triggerLabel}</span> : triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction}>
          {children}
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {state.message && !state.ok ? <p aria-live="polite" className="mt-3 text-sm text-danger">{state.message}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            <ConfirmedSubmit label={confirmLabel} />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmedSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending ? "Выполняется…" : label}
    </Button>
  );
}
