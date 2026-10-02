import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cachedAttachment, cacheAttachment } from "@/lib/attachment-cache";
import { loadAttachment, type DecryptedMessage } from "@/lib/messaging";

type PhotoCarouselProps = {
  conversationId: string;
  messages: DecryptedMessage[];
  selectedMessageId: string;
  onClose: () => void;
};

export function PhotoCarousel({ conversationId, messages, selectedMessageId, onClose }: PhotoCarouselProps) {
  const selectedIndex = messages.findIndex((message) => message.id === selectedMessageId);
  const safeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const message = messages[safeIndex];
  const [url, setUrl] = useState<string | null>(() => message ? cachedAttachment(message.id) ?? null : null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [activeId, setActiveId] = useState(message?.id ?? selectedMessageId);
  const touchStartX = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const activeIndex = messages.findIndex((photo) => photo.id === activeId);
  const currentIndex = activeIndex >= 0 ? activeIndex : safeIndex;
  const current = messages[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < messages.length - 1;

  function move(direction: -1 | 1) {
    const next = messages[currentIndex + direction];
    if (next) setActiveId(next.id);
  }

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setError(false);
    const cached = cachedAttachment(current.id);
    setUrl(cached ?? null);

    if (!cached) {
      void loadAttachment(conversationId, current)
        .then((result) => {
          if (cancelled) {
            URL.revokeObjectURL(result);
            return;
          }
          cacheAttachment(conversationId, current.id, result);
          setUrl(result);
        })
        .catch(() => { if (!cancelled) setError(true); });
    }

    for (const neighbor of [messages[currentIndex - 1], messages[currentIndex + 1]]) {
      if (!neighbor || cachedAttachment(neighbor.id)) continue;
      void loadAttachment(conversationId, neighbor).then((result) => {
        if (cancelled) URL.revokeObjectURL(result);
        else cacheAttachment(conversationId, neighbor.id, result);
      }).catch(() => undefined);
    }

    return () => { cancelled = true; };
  }, [conversationId, current, currentIndex, messages, retry]);

  if (!current) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex touch-pan-y flex-col bg-background/95 outline-none"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      }}
      onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 45) return;
        if (end < start && hasNext) move(1);
        if (end > start && hasPrevious) move(-1);
      }}
    >
      <div className="flex h-16 shrink-0 items-center justify-between px-4" onClick={(event) => event.stopPropagation()}>
        <span className="text-sm font-medium text-mist">{currentIndex + 1} of {messages.length}</span>
        <Button type="button" variant="ghost" size="icon" aria-label="Close photo" className="text-foreground" onClick={onClose}><X /></Button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <Button type="button" variant="ghost" size="icon" aria-label="Previous photo" disabled={!hasPrevious} className="absolute left-3 z-10 size-11 rounded-full glass-strong sm:left-6" onClick={(event) => { event.stopPropagation(); move(-1); }}><ChevronLeft /></Button>
        {error ? (
          <div className="flex flex-col items-center gap-3 text-sm text-mist" onClick={(event) => event.stopPropagation()}>
            <span>Photo unavailable</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button>
          </div>
        ) : url ? (
          <img src={url} alt="Shared photo enlarged" className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
        ) : (
          <div role="status" aria-label="Loading photo" className="h-64 w-64 max-w-[70vw] animate-pulse rounded-md bg-muted/40" />
        )}
        <Button type="button" variant="ghost" size="icon" aria-label="Next photo" disabled={!hasNext} className="absolute right-3 z-10 size-11 rounded-full glass-strong sm:right-6" onClick={(event) => { event.stopPropagation(); move(1); }}><ChevronRight /></Button>
      </div>

      {current.body ? (
        <p className="shrink-0 px-16 pb-5 text-center text-sm text-mist" onClick={(event) => event.stopPropagation()}>{current.body}</p>
      ) : null}
    </div>
  );
}