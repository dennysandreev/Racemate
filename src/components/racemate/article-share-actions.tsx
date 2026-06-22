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
    <div className="flex flex-wrap items-center gap-2 border-t stitch-divider p-4">
      <Button onClick={share} size="sm" type="button" variant="secondary">
        <Share2 aria-hidden="true" className="size-4" />
        Поделиться
      </Button>
      {[
        { label: "Telegram", platform: "telegram" as const },
        { label: "VK", platform: "vk" as const },
        { label: "X", platform: "x" as const },
      ].map((item) => (
        <Button key={item.label} onClick={() => openSocialShare(item.platform)} size="sm" type="button" variant="outline">
          {item.label}
        </Button>
      ))}
      <Button aria-label="Скопировать ссылку" onClick={copyLink} size="icon" type="button" variant="ghost">
        {copied ? <Check aria-hidden="true" className="size-4 text-success" /> : <Copy aria-hidden="true" className="size-4" />}
      </Button>
      <Send aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
    </div>
  );
}
