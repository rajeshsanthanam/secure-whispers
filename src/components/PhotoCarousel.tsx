import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cachedAttachment, cacheAttachment } from "@/lib/attachment-cache";
import { loadAttachment, type DecryptedMessage } from "@/lib/messaging";
import { clampPhotoTransform, PHOTO_IDENTITY, wheelPhotoScale, zoomPhotoAt, type PhotoTransform } from "@/lib/photo-zoom";

type PhotoCarouselProps = {
  conversationId: string;
  messages: DecryptedMessage[];
  selectedMessageId: string;
  onClose: () => void;
  total?: number;
  hasMoreOlder?: boolean;
  onNeedOlder?: () => Promise<void>;
  senderName?: (senderId: string) => string;
};

export function PhotoCarousel({ conversationId, messages, selectedMessageId, onClose, total, hasMoreOlder, onNeedOlder, senderName }: PhotoCarouselProps) {
  const selectedIndex = messages.findIndex((message) => message.id === selectedMessageId);
  const safeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const message = messages[safeIndex];
  const [url, setUrl] = useState<string | null>(() => message ? cachedAttachment(message.id) ?? null : null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [activeId, setActiveId] = useState(message?.id ?? selectedMessageId);
  const touchStartX = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const loadingOlder = useRef(false);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [transform, setTransform] = useState<PhotoTransform>(PHOTO_IDENTITY);
  const transformRef = useRef(PHOTO_IDENTITY);
  const [animateZoom, setAnimateZoom] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: { x: number; y: number }; time: number; moved: boolean; pinched: boolean; onImage: boolean } | null>(null);
  const lastTap = useRef<{ x: number; y: number; time: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const pointerStartedOnImage = useRef(false);
  const lastPointerType = useRef("mouse");
  const pendingClose = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelHandler = useRef<(event: WheelEvent) => void>(() => undefined);

  const activeIndex = messages.findIndex((photo) => photo.id === activeId);
  const currentIndex = activeIndex >= 0 ? activeIndex : safeIndex;
  const current = messages[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < messages.length - 1;

  function move(direction: -1 | 1) {
    const next = messages[currentIndex + direction];
    if (next) setActiveId(next.id);
  }

  function bounds() {
    return { width: surfaceRef.current?.clientWidth ?? 0, height: surfaceRef.current?.clientHeight ?? 0, imageWidth: imageRef.current?.clientWidth ?? 0, imageHeight: imageRef.current?.clientHeight ?? 0 };
  }

  function updateTransform(next: PhotoTransform, animate = false) {
    const clamped = clampPhotoTransform(next, bounds());
    transformRef.current = clamped;
    setAnimateZoom(animate);
    setTransform(clamped);
  }

  function localPoint(x: number, y: number) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return { x: x - (rect?.left ?? 0) - (rect?.width ?? 0) / 2, y: y - (rect?.top ?? 0) - (rect?.height ?? 0) / 2 };
  }

  function zoomTo(scale: number, point = { x: 0, y: 0 }, animate = false) {
    updateTransform(zoomPhotoAt(transformRef.current, scale, point, bounds()), animate);
  }

  function toggleZoom(x: number, y: number) {
    suppressClickUntil.current = performance.now() + 50;
    lastTap.current = null;
    zoomTo(transformRef.current.scale > 1 ? 1 : 2.5, localPoint(x, y), true);
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    lastPointerType.current = event.pointerType;
    if (pendingClose.current) { clearTimeout(pendingClose.current); pendingClose.current = null; }
    pointerStartedOnImage.current = event.target === imageRef.current;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { start: { x: event.clientX, y: event.clientY }, time: performance.now(), moved: false, pinched: false, onImage: event.target === imageRef.current };
    } else if (gesture.current) {
      gesture.current.pinched = true;
      lastTap.current = null;
    }
    setAnimateZoom(false);
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.current.values()];
    if (gesture.current && Math.hypot(event.clientX - gesture.current.start.x, event.clientY - gesture.current.start.y) > 8) gesture.current.moved = true;
    if (before.length === 2 && after.length === 2) {
      const [a, b] = before;
      const [c, d] = after;
      if (!a || !b || !c || !d) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance < 1) return;
      const oldMid = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const newMid = localPoint((c.x + d.x) / 2, (c.y + d.y) / 2);
      const next = zoomPhotoAt(transformRef.current, transformRef.current.scale * Math.hypot(c.x - d.x, c.y - d.y) / distance, oldMid, bounds());
      updateTransform({ ...next, x: next.x + newMid.x - oldMid.x, y: next.y + newMid.y - oldMid.y });
    } else if (after.length === 1 && transformRef.current.scale > 1) {
      updateTransform({ ...transformRef.current, x: transformRef.current.x + event.clientX - previous.x, y: transformRef.current.y + event.clientY - previous.y });
    }
  }

  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const currentGesture = gesture.current;
    if (!currentGesture) return;
    if (currentGesture.pinched || currentGesture.moved || event.type === "pointercancel") suppressClickUntil.current = performance.now() + 50;
    if (pointers.current.size) return;
    gesture.current = null;
    if (event.type === "pointercancel") { lastTap.current = null; return; }
    if (currentGesture.pinched) {
      if (transformRef.current.scale < 1.05) updateTransform(PHOTO_IDENTITY, true);
      return;
    }
    if (currentGesture.moved) {
      lastTap.current = null;
      const dx = event.clientX - currentGesture.start.x;
      const dy = event.clientY - currentGesture.start.y;
      if (transformRef.current.scale === 1 && Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
      return;
    }
    if (event.pointerType !== "mouse" && performance.now() - currentGesture.time < 300) {
      const tap = lastTap.current;
      if (tap && performance.now() - tap.time <= 300 && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 30) toggleZoom(event.clientX, event.clientY);
      else lastTap.current = { x: event.clientX, y: event.clientY, time: performance.now() };
    }
  }

  wheelHandler.current = (event) => {
    event.preventDefault();
    suppressClickUntil.current = performance.now() + 50;
    zoomTo(wheelPhotoScale(transformRef.current.scale, event.deltaY, event.deltaMode), localPoint(event.clientX, event.clientY));
  };

  useEffect(() => {
    updateTransform(PHOTO_IDENTITY);
    pointers.current.clear();
    gesture.current = null;
    lastTap.current = null;
    touchStartX.current = null;
    return () => { if (pendingClose.current) clearTimeout(pendingClose.current); };
  }, [current?.id]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const onWheel = (event: WheelEvent) => wheelHandler.current(event);
    const resize = new ResizeObserver(() => updateTransform(transformRef.current));
    resize.observe(surface);
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => { surface.removeEventListener("wheel", onWheel); resize.disconnect(); };
  }, [url, error]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Near the oldest loaded photo: fetch older ones. Position is tracked by id, so prepending keeps the same photo.
  useEffect(() => {
    if (!hasMoreOlder || !onNeedOlder || currentIndex >= 5 || loadingOlder.current) return;
    loadingOlder.current = true;
    void onNeedOlder().finally(() => { loadingOlder.current = false; });
  }, [currentIndex, hasMoreOlder, onNeedOlder, messages.length]);

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
      onClick={() => { if (transformRef.current.scale === 1 && performance.now() > suppressClickUntil.current) onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
        if (["+", "=", "-", "0"].includes(event.key)) {
          event.preventDefault();
          zoomTo(event.key === "0" ? 1 : transformRef.current.scale * (event.key === "-" ? 1 / 1.25 : 1.25), { x: 0, y: 0 }, event.key === "0");
        }
      }}
      onTouchStart={(event) => { touchStartX.current = event.touches.length === 1 && transformRef.current.scale === 1 ? event.changedTouches[0]?.clientX ?? null : null; }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (event.touches.length || transformRef.current.scale > 1 || performance.now() <= suppressClickUntil.current || start === null || end === undefined || Math.abs(end - start) < 45) return;
        if (end < start && hasNext) move(1);
        if (end > start && hasPrevious) move(-1);
      }}
    >
      <div className="flex h-16 shrink-0 items-center justify-between px-4" onClick={(event) => event.stopPropagation()}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-mist">
            {total !== undefined ? Math.max(1, total - (messages.length - 1 - currentIndex)) : currentIndex + 1} of {total ?? messages.length}
          </p>
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Zoom out" title="Zoom out" disabled={!url || transform.scale <= 1} onClick={() => zoomTo(transformRef.current.scale / 1.25)}><Minus className="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Zoom in" title="Zoom in" disabled={!url || transform.scale >= 5} onClick={() => zoomTo(transformRef.current.scale * 1.25)}><Plus className="size-4" /></Button>
          </div>
          <p className="truncate text-xs text-mist/70">
            {senderName ? `${senderName(current.senderId)} · ` : ""}
            {new Date(current.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
          </p>
        </div>
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
          <div
            ref={surfaceRef}
            className="flex h-full w-full touch-none items-center justify-center overflow-hidden"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}
            onTouchStart={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
            onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); if (lastPointerType.current === "mouse") toggleZoom(event.clientX, event.clientY); }}
            onClick={(event) => {
              event.stopPropagation();
              if (event.target === event.currentTarget && !pointerStartedOnImage.current && transformRef.current.scale === 1 && performance.now() > suppressClickUntil.current && event.detail < 2) {
                pendingClose.current = setTimeout(() => {
                  pendingClose.current = null;
                  lastTap.current = null;
                  if (transformRef.current.scale === 1 && performance.now() > suppressClickUntil.current) onClose();
                }, 300);
              }
            }}
          >
            <img ref={imageRef} src={url} alt="Shared photo enlarged" draggable={false} className={`max-h-full max-w-full shrink-0 select-none object-contain ${transform.scale > 1 ? "cursor-grab active:cursor-grabbing" : ""} ${animateZoom ? "transition-transform duration-150 motion-reduce:transition-none" : ""}`} style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }} onClick={(event) => event.stopPropagation()} />
          </div>
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