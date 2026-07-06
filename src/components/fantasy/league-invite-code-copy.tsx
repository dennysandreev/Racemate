"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

type LeagueInviteCodeCopyProps = {
  code: string;
};

export function LeagueInviteCodeCopy({ code }: LeagueInviteCodeCopyProps) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Скопируй код лиги", code);
    }
  }

  return (
    <Button
      aria-label={copied ? "Код скопирован" : "Скопировать код лиги"}
      className="shrink-0"
      onClick={copyCode}
      size="icon"
      title={copied ? "Код скопирован" : "Скопировать код лиги"}
      type="button"
      variant="outline"
    >
      {copied ? (
        <Check aria-hidden="true" className="size-4 text-success" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
}
