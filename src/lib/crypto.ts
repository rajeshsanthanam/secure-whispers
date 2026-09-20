/**
 * Client-side end-to-end encryption primitives (Web Crypto only).
 *
 * Identity: ECDH P-256 key pair. The private key is encrypted with a key
 * derived from the user's password (PBKDF2, 250k iterations) before it ever
 * leaves the browser. Decrypted private keys live in memory only.
 */

const PBKDF2_ITERATIONS = 250_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export type WrappedKeyBlob = {
  /** base64 AES-GCM iv */
  iv: string;
  /** base64 ciphertext of the raw conversation key */
  ct: string;
  /** base64 SPKI public key of the peer used for the ECDH agreement */
  peer: string;
};

export type EncryptedPrivateKeyBlob = { iv: string; ct: string };

export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]!);
  return btoa(out);
}

export function fromBase64(value: string): Uint8Array {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function deriveWrappingKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type Identity = {
  publicKey: string;
  encryptedPrivateKeyBlob: string;
  salt: string;
  privateKey: CryptoKey;
};

export async function createIdentity(password: string): Promise<Identity> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
    "deriveBits",
  ]);
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, wrappingKey, pkcs8);

  const blob: EncryptedPrivateKeyBlob = { iv: toBase64(iv), ct: toBase64(ct) };

  return {
    publicKey: toBase64(spki),
    encryptedPrivateKeyBlob: JSON.stringify(blob),
    salt: toBase64(salt),
    privateKey: pair.privateKey,
  };
}

export async function unlockIdentity(
  password: string,
  saltB64: string,
  blobJson: string,
): Promise<CryptoKey> {
  const blob = JSON.parse(blobJson) as EncryptedPrivateKeyBlob;
  const wrappingKey = await deriveWrappingKey(password, fromBase64(saltB64));
  const pkcs8 = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(blob.iv) as unknown as BufferSource },
    wrappingKey,
    fromBase64(blob.ct) as unknown as BufferSource,
  );
  return crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveKey",
    "deriveBits",
  ]);
}

export async function importPublicKey(publicKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    fromBase64(publicKeyB64) as unknown as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

async function deriveSharedKey(privateKey: CryptoKey, peerPublicKeyB64: string): Promise<CryptoKey> {
  const peer = await importPublicKey(peerPublicKeyB64);
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: peer },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createConversationKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** Wrap a conversation key for one member, using our own key pair as the ECDH peer. */
export async function wrapConversationKey(
  conversationKey: CryptoKey,
  myPrivateKey: CryptoKey,
  myPublicKeyB64: string,
  memberPublicKeyB64: string,
): Promise<WrappedKeyBlob> {
  const raw = await crypto.subtle.exportKey("raw", conversationKey);
  const shared = await deriveSharedKey(myPrivateKey, memberPublicKeyB64);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, shared, raw);
  return { iv: toBase64(iv), ct: toBase64(ct), peer: myPublicKeyB64 };
}

export async function unwrapConversationKey(
  blob: WrappedKeyBlob,
  myPrivateKey: CryptoKey,
): Promise<CryptoKey> {
  const shared = await deriveSharedKey(myPrivateKey, blob.peer);
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(blob.iv) as unknown as BufferSource },
    shared,
    fromBase64(blob.ct) as unknown as BufferSource,
  );
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptMessage(
  conversationKey: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    conversationKey,
    enc.encode(plaintext),
  );
  return { ciphertext: toBase64(ct), iv: toBase64(iv) };
}

export async function decryptMessage(
  conversationKey: CryptoKey,
  ciphertext: string,
  iv: string,
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) as unknown as BufferSource },
    conversationKey,
    fromBase64(ciphertext) as unknown as BufferSource,
  );
  return dec.decode(plain);
}

/** SHA-256 fingerprint of a public key, grouped for human comparison. */
export async function keyFingerprint(publicKeyB64: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", fromBase64(publicKeyB64) as unknown as BufferSource);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return (hex.slice(0, 32).match(/.{4}/g) ?? []).join(" ");
}
