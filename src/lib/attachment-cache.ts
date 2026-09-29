/** Decrypted image URLs only live in this browser tab. */
const images = new Map<string, { conversationId: string; url: string }>();

export function cachedAttachment(messageId: string): string | undefined {
  return images.get(messageId)?.url;
}

export function cacheAttachment(conversationId: string, messageId: string, url: string) {
  const previous = images.get(messageId);
  if (previous) URL.revokeObjectURL(previous.url);
  images.set(messageId, { conversationId, url });
}

export function clearCachedAttachment(messageId: string) {
  const image = images.get(messageId);
  if (!image) return;
  URL.revokeObjectURL(image.url);
  images.delete(messageId);
}

export function clearAttachmentCache(conversationId?: string) {
  for (const [messageId, image] of images) {
    if (conversationId && image.conversationId !== conversationId) continue;
    URL.revokeObjectURL(image.url);
    images.delete(messageId);
  }
}