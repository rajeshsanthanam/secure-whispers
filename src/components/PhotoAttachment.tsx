import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cachedAttachment, cacheAttachment } from "@/lib/attachment-cache";
import { loadAttachment, type DecryptedMessage } from "@/lib/messaging";

export function PhotoAttachment({ conversationId, message, onOpen }: {
  conversationId: string;
  message: DecryptedMessage;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState(() => cachedAttachment(message.id) ?? null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cached = cachedAttachment(message.id);
    if (cached) {
      setUrl(cached);
      return;
    }
    void loadAttachment(conversationId, message).then((result) => {
      if (cancelled) URL.revokeObjectURL(result);
      else {
        cacheAttachment(conversationId, message.id, result);
        setUrl(result);
      }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [conversationId, message, retry]);

  if (error) return (
    <div className="flex min-h-28 w-48 flex-col items-center justify-center gap-2 rounded-md bg-background/30 text-xs text-mist">
      <span>Photo unavailable</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => { setError(false); setRetry((n) => n + 1); }}>Retry</Button>
    </div>
  );
  if (!url) return <div role="status" aria-label="Loading photo" className="h-36 w-48 animate-pulse rounded-md bg-muted/40" />;
  return (
    <Button type="button" variant="ghost" className="h-auto max-w-full p-0 hover:bg-transparent" onClick={onOpen} aria-label="View photo full size">
      <img src={url} alt="Shared photo" className="max-h-72 max-w-full rounded-md object-contain" />
    </Button>
  );
}