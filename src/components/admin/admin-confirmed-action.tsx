"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
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
  triggerLabel,
  triggerVariant = "secondary",
}: {
  action: (state: AdminActionResult, formData: FormData) => Promise<AdminActionResult>;
  children?: React.ReactNode;
  confirmLabel: string;
  description: string;
  title: string;
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
        <Button size="sm" type="button" variant={triggerVariant}>{triggerLabel}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction}>
          {children}
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {state.message && !state.ok ? <p className="mt-3 text-sm text-danger">{state.message}</p> : null}
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
    <AlertDialogAction disabled={pending} type="submit">
      {pending ? "Выполняется…" : label}
    </AlertDialogAction>
  );
}
