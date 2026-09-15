"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdminActionResult } from "@/types/admin";

const initialState: AdminActionResult = { ok: false, message: "" };

export function AdminConfirmedForm({
  action,
  children,
  className,
  confirmLabel,
  description,
  submitLabel = "Сохранить",
  submitVariant = "default",
  title,
}: {
  action: (state: AdminActionResult, formData: FormData) => Promise<AdminActionResult>;
  children?: React.ReactNode;
  className?: string;
  confirmLabel: string;
  description: string;
  submitLabel?: string;
  submitVariant?: ButtonProps["variant"];
  title: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (previousState: AdminActionResult, formData: FormData) => {
    const result = await action(previousState, formData);
    if (result.ok) setOpen(false);
    return result;
  }, initialState);

  useEffect(() => {
    if (!state.ok || !state.message) return;
    toast.success(state.message);
  }, [state]);

  return (
    <>
      <form
        action={formAction}
        className={cn("flex flex-col gap-3", className)}
        onSubmit={(event) => {
          if (confirmedRef.current) {
            confirmedRef.current = false;
            return;
          }
          event.preventDefault();
          setOpen(true);
        }}
        ref={formRef}
      >
        {children}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending} size="sm" type="submit" variant={submitVariant}>
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
            {pending ? "Выполняется…" : submitLabel}
          </Button>
          {state.message ? (
            <p aria-live="polite" className={cn("text-sm", state.ok ? "text-success" : "text-danger")}>
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {state.message && !state.ok ? <p aria-live="polite" className="text-sm text-danger">{state.message}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Отмена</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() => {
                confirmedRef.current = true;
                formRef.current?.requestSubmit();
              }}
              type="button"
            >
              {pending ? "Выполняется…" : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
