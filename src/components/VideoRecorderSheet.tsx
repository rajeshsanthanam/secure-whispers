import { useCallback, useEffect, useRef, useState } from "react";
import { SwitchCamera, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const MAX_SECONDS = 15;
const MAX_BYTES = 8 * 1024 * 1024;
const MIME_TYPES = [
  "video/mp4;codecs=avc1,mp4a",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function VideoRecorderSheet({ open, onClose, onSend }: {
  open: boolean;
  onClose: () => void;
  onSend: (blob: Blob) => void;
}) {
  const liveRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [recording, setRecording] = useState(false);
  const [remaining, setRemaining] = useState(MAX_SECONDS);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (liveRef.current) liveRef.current.srcObject = null;
  }, []);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  // Start the camera while the sheet is open and no clip is under review.
  useEffect(() => {
    if (!open || clip) return;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser can't record video.");
      onClose();
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: true }).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (liveRef.current) liveRef.current.srcObject = stream;
    }).catch((error: DOMException) => {
      if (cancelled) return;
      toast.error(error?.name === "NotAllowedError"
        ? "Camera access was blocked. Allow camera and microphone in your browser settings to record."
        : "No camera was found on this device.");
      onClose();
    });
    return () => { cancelled = true; stopTracks(); };
  }, [open, clip, facing, onClose, stopTracks]);

  useEffect(() => () => { clearTimer(); recorderRef.current?.state === "recording" && recorderRef.current.stop(); stopTracks(); }, [stopTracks]);

  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  function stopRecording() {
    clearTimer();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 64_000 });
    } catch {
      toast.error("This browser can't record video.");
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "video/webm" });
      stopTracks();
      setClip({ blob, url: URL.createObjectURL(blob) });
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setRemaining(MAX_SECONDS);
    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      const left = MAX_SECONDS - Math.floor((Date.now() - startedAt) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) stopRecording();
    }, 250);
  }

  function close() {
    stopRecording();
    stopTracks();
    setClip(null);
    onClose();
  }

  function send() {
    if (!clip) return;
    if (clip.blob.size > MAX_BYTES) {
      toast.error("Clip too large, try a shorter one");
      return;
    }
    const blob = clip.blob;
    setClip(null);
    onSend(blob);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-label="Record video">
      <div className="flex items-center justify-between p-3">
        <Button type="button" variant="ghost" size="icon" aria-label="Close recorder" onClick={close}><X /></Button>
        {!clip ? <span className="font-display text-lg tabular-nums" aria-live="polite">0:{String(remaining).padStart(2, "0")}</span> : <span>Review</span>}
        {!clip ? (
          <Button type="button" variant="ghost" size="icon" aria-label="Flip camera" disabled={recording} onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}><SwitchCamera /></Button>
        ) : <span className="size-9" />}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {clip ? (
          <video src={clip.url} controls playsInline autoPlay className="max-h-full max-w-full" />
        ) : (
          <video ref={liveRef} autoPlay muted playsInline className="max-h-full max-w-full" />
        )}
      </div>
      <div className="flex items-center justify-center gap-3 p-5">
        {clip ? (
          <>
            <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            <Button type="button" variant="outline" onClick={() => setClip(null)}>Retake</Button>
            <Button type="button" onClick={send}>Send</Button>
          </>
        ) : (
          <Button
            type="button"
            aria-label={recording ? "Stop recording" : "Start recording"}
            onClick={recording ? stopRecording : startRecording}
            className={`size-16 rounded-full ${recording ? "bg-destructive hover:bg-destructive/90" : ""}`}
          >
            {recording ? <span className="size-5 rounded-sm bg-foreground" /> : <span className="size-6 rounded-full bg-foreground" />}
          </Button>
        )}
      </div>
    </div>
  );
}
