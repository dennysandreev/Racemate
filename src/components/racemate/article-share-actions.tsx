"use client";

import { useState } from "react";
import { Check, Copy, Send, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ArticleShareActionsProps = {
  title: string;
};

export function ArticleShareActions({ title }: ArticleShareActionsProps) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const shareUrl = window.location.href;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Скопируй ссылку", shareUrl);
    }
  }

  async function share() {
    const shareUrl = window.location.href;

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

  function openSocialShare(platform: "telegram" | "vk" | "x") {
    const encodedUrl = encodeURIComponent(window.location.href);
    const encodedTitle = encodeURIComponent(title);
    const href = platform === "telegram"
      ? `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`
      : platform === "vk"
        ? `https://vk.com/share.php?url=${encodedUrl}&title=${encodedTitle}`
        : `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;

    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid gap-3 border-t stitch-divider p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
          <Send aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-bold">Поделиться материалом</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Отправь ссылку или выбери соцсеть.</p>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Button className="w-full" onClick={share} size="sm" type="button" variant="secondary">
          <Share2 aria-hidden="true" className="size-4" />
          Поделиться
        </Button>
        <Button
          aria-label={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          onClick={copyLink}
          size="icon"
          title={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          type="button"
          variant="outline"
        >
          {copied ? <Check aria-hidden="true" className="size-4 text-success" /> : <Copy aria-hidden="true" className="size-4" />}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Telegram", platform: "telegram" as const },
          { label: "VK", platform: "vk" as const },
          { label: "X", platform: "x" as const },
        ].map((item) => (
          <Button className="w-full px-2" key={item.label} onClick={() => openSocialShare(item.platform)} size="sm" type="button" variant="outline">
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
