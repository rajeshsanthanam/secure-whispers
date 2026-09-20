/**
 * In-memory only key material. Nothing here is ever persisted to
 * localStorage, sessionStorage, IndexedDB or cookies.
 */

type Vault = {
  privateKey: CryptoKey | null;
  publicKey: string | null;
  conversationKeys: Map<string, Map<number, CryptoKey>>;
};

const vault: Vault = {
  privateKey: null,
  publicKey: null,
  conversationKeys: new Map(),
};

export function setIdentity(privateKey: CryptoKey, publicKey: string) {
  vault.privateKey = privateKey;
  vault.publicKey = publicKey;
}

export function getPrivateKey() {
  return vault.privateKey;
}

export function getPublicKey() {
  return vault.publicKey;
}

export function requirePrivateKey(): CryptoKey {
  if (!vault.privateKey) throw new Error("Locked: private key is not in memory");
  return vault.privateKey;
}

export function cacheConversationKeys(conversationId: string, keys: Map<number, CryptoKey>) {
  vault.conversationKeys.set(conversationId, keys);
}

export function getCachedConversationKeys(conversationId: string) {
  return vault.conversationKeys.get(conversationId);
}

export function forgetConversation(conversationId: string) {
  vault.conversationKeys.delete(conversationId);
}

/** Wipe every piece of key material from memory (sign-out). */
export function wipeKeys() {
  vault.privateKey = null;
  vault.publicKey = null;
  vault.conversationKeys.clear();
}
