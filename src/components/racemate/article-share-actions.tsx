"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ArticleShareActionsProps = {
  shareUrl: string;
  title: string;
};

export function ArticleShareActions({ shareUrl, title }: ArticleShareActionsProps) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Скопируй ссылку", shareUrl);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url: shareUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    await copyLink();
  }

  return (
    <div className="border-t stitch-divider p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Button className="w-full" onClick={share} size="sm" type="button" variant="secondary">
          <Share2 aria-hidden="true" className="size-4" />
          Поделиться
        </Button>
        <Button
          aria-label={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          className="size-9"
          onClick={copyLink}
          size="icon"
          title={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          type="button"
          variant="outline"
        >
          {copied ? <Check aria-hidden="true" className="size-4 text-success" /> : <Copy aria-hidden="true" className="size-4" />}
        </Button>
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? "Ссылка скопирована" : ""}
      </span>
    </div>
  );
}
