"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { adminNavigation } from "@/components/admin/admin-navigation";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AdminCommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        aria-label="Открыть поиск по админке"
        className="min-w-0 justify-start md:w-72"
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Search aria-hidden="true" data-icon="inline-start" />
        <span className="truncate">Найти раздел</span>
        <span className="ml-auto hidden font-mono text-[0.68rem] text-muted-foreground sm:inline">
          ⌘K
        </span>
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Поиск по админке</DialogTitle>
            <DialogDescription>Перейди к нужному разделу RaceSide.</DialogDescription>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Новости, задачи, пользователи…" />
            <CommandList>
              <CommandEmpty>Ничего не найдено. Проверь запрос.</CommandEmpty>
              <CommandGroup heading="Разделы">
                {adminNavigation.map((item, index) => (
                  <CommandItem
                    key={item.href}
                    onSelect={() => navigate(item.href)}
                    value={item.label}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {index < 9 ? <CommandShortcut>{index + 1}</CommandShortcut> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
