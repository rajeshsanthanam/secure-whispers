/**
 * Password policy + per-username login throttling.
 *
 * There is no password recovery path, so weak passwords and brute force are
 * both blocked as early as possible: locally here, and server-side by the
 * leaked-password (HIBP) check on the auth service.
 */

const COMMON_PASSWORDS = [
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd123",
  "123456789",
  "1234567890",
  "12345678910",
  "111111111",
  "0123456789",
  "qwertyuiop",
  "qwerty12345",
  "qwerty123456",
  "iloveyou123",
  "letmein123",
  "welcome123",
  "admin12345",
  "administrator",
  "abc123456",
  "abcd1234",
  "monkey1234",
  "football123",
  "baseball123",
  "dragon1234",
  "sunshine123",
  "princess123",
  "shadow1234",
  "michael123",
  "jennifer123",
  "trustno1234",
  "superman123",
  "batman1234",
  "starwars123",
  "whatever123",
  "computer123",
  "internet123",
  "samsung123",
  "chocolate1",
  "liverpool1",
  "manchester1",
  "secretkey1",
  "secretpassword",
  "changeme123",
  "qazwsxedc123",
  "1q2w3e4r5t",
  "zaq12wsx34",
  "asdfghjkl123",
  "iloveyouforever",
  "thisisapassword",
  "correcthorse",
  "keyboardcat1",
  "loveyou1234",
  "pokemon1234",
  "google12345",
  "facebook123",
  "instagram123",
  "bitcoin1234",
  "freedom1234",
  "whiskey1234",
  "cookie12345",
];

export type PasswordCheck = { ok: boolean; problems: string[]; score: number };

export function checkPassword(password: string): PasswordCheck {
  const problems: string[] = [];
  const value = password.trim();

  if (value.length < 10) problems.push("Use at least 10 characters.");
  const lower = value.toLowerCase();

  if (COMMON_PASSWORDS.some((c) => lower === c || lower.startsWith(c))) {
    problems.push("This is a commonly used password. Choose something unique.");
  }
  if (/^\d+$/.test(value)) problems.push("Digits only is too easy to guess.");
  if (/^(.)\1+$/.test(value)) problems.push("Avoid repeating a single character.");
  if (isSequential(lower)) problems.push("Avoid keyboard or alphabet sequences.");
  if (new Set(value).size < 5) problems.push("Use a wider mix of characters.");

  let score = 0;
  if (value.length >= 10) score += 1;
  if (value.length >= 16) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  if (problems.length) score = Math.min(score, 1);

  return { ok: problems.length === 0, problems, score };
}

function isSequential(value: string) {
  const rows = ["abcdefghijklmnopqrstuvwxyz", "1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
  return rows.some((row) => row.includes(value) || [...row].reverse().join("").includes(value));
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function checkUsername(username: string): string | null {
  const value = normalizeUsername(username);
  if (value.length < 3) return "Usernames need at least 3 characters.";
  if (value.length > 24) return "Usernames can be at most 24 characters.";
  if (!/^[a-z0-9._-]+$/.test(value))
    return "Use only letters, numbers, dots, dashes and underscores.";
  return null;
}

/** Synthetic address: no email is ever collected from or shown to the user. */
export function syntheticEmail(username: string) {
  return `${normalizeUsername(username)}@app.local`;
}

/* ---------- login throttle (per username, exponential backoff) ---------- */

type Attempt = { fails: number; blockedUntil: number };

const THROTTLE_PREFIX = "sm.throttle.";
const FREE_ATTEMPTS = 5;

function readAttempt(username: string): Attempt {
  if (typeof localStorage === "undefined") return { fails: 0, blockedUntil: 0 };
  try {
    const raw = localStorage.getItem(THROTTLE_PREFIX + normalizeUsername(username));
    return raw ? (JSON.parse(raw) as Attempt) : { fails: 0, blockedUntil: 0 };
  } catch {
    return { fails: 0, blockedUntil: 0 };
  }
}

function writeAttempt(username: string, attempt: Attempt) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THROTTLE_PREFIX + normalizeUsername(username), JSON.stringify(attempt));
}

/** Milliseconds the user still has to wait, or 0 when a sign-in is allowed. */
export function loginCooldown(username: string): number {
  const { blockedUntil } = readAttempt(username);
  return Math.max(0, blockedUntil - Date.now());
}

export function recordLoginFailure(username: string) {
  const attempt = readAttempt(username);
  const fails = attempt.fails + 1;
  let blockedUntil = 0;
  if (fails > FREE_ATTEMPTS) {
    const seconds = Math.min(15 * 60, 5 * 2 ** (fails - FREE_ATTEMPTS - 1));
    blockedUntil = Date.now() + seconds * 1000;
  }
  writeAttempt(username, { fails, blockedUntil });
}

export function clearLoginFailures(username: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(THROTTLE_PREFIX + normalizeUsername(username));
}

export function formatCooldown(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}
