import { useState } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cachedAttachment, cacheAttachment } from "@/lib/attachment-cache";
import { loadVideoAttachment, type DecryptedMessage } from "@/lib/messaging";

/** Videos are only downloaded and decrypted when tapped. */
export function VideoAttachment({ conversationId, message }: { conversationId: string; message: DecryptedMessage }) {
  const [url, setUrl] = useState(() => cachedAttachment(message.id) ?? null);
  const [loading, setLoading] = useState(false);
  const [unplayable, setUnplayable] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await loadVideoAttachment(conversationId, message);
      cacheAttachment(conversationId, message.id, result);
      setUrl(result);
    } catch (error) {
      toast.error((error as Error).message || "Video could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  if (!url) return (
    <Button type="button" variant="ghost" disabled={loading} onClick={() => void load()} aria-label="Play video"
      className="flex h-36 w-48 flex-col items-center justify-center gap-2 rounded-md bg-background/30 text-xs text-mist">
      <Play className={loading ? "animate-pulse" : ""} />
      <span>{loading ? "Loading video…" : "Tap to play"}</span>
    </Button>
  );
  if (unplayable) return (
    <div className="flex min-h-28 w-48 flex-col items-center justify-center gap-2 rounded-md bg-background/30 p-2 text-center text-xs text-mist">
      <span>This video can't be played on this device</span>
      <a href={url} download="video" className="text-accent-soft underline">Download video</a>
    </div>
  );
  return <video src={url} controls playsInline preload="metadata" autoPlay onError={() => setUnplayable(true)} className="max-h-72 max-w-full rounded-md" />;
}
