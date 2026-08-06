"use client";

import { Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AdminArticleEditorDialog({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="secondary">
          <Pencil aria-hidden="true" data-icon="inline-start" />
          Править
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"
        showCloseButton={false}
      >
        <DialogHeader className="text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle>Правка материала</DialogTitle>
              <DialogDescription className="mt-2 line-clamp-2">
                {title}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button className="shrink-0" size="sm" type="button" variant="outline">
                <X aria-hidden="true" data-icon="inline-start" />
                Закрыть
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
