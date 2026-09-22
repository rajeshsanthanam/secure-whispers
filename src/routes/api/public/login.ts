import { createFileRoute } from "@tanstack/react-router";

/**
 * Server-side, per-username login throttle.
 *
 * The browser never talks to the auth password grant directly: it posts here,
 * we check (and record) the attempt in a table only the service role can touch,
 * and on success hand back the tokens for `supabase.auth.setSession`.
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export const Route = createFileRoute("/api/public/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: { username?: unknown; password?: unknown };
        try {
          payload = (await request.json()) as typeof payload;
        } catch {
          return json({ error: "Invalid request." }, 400);
        }

        const username =
          typeof payload.username === "string" ? normalizeUsername(payload.username) : "";
        const password = typeof payload.password === "string" ? payload.password : "";
        if (!username || !password) {
          return json({ error: "Invalid username or password." }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Pre-check only: does not count as a failure.
        const { data: blockedFor, error: peekError } = await supabaseAdmin.rpc(
          "peek_login_block",
          { _username: username },
        );
        if (peekError) return json({ error: "Sign-in is unavailable right now." }, 500);
        if ((blockedFor ?? 0) > 0) {
          return json(
            { error: "Too many failed attempts.", retry_after_seconds: blockedFor },
            429,
          );
        }

        const supabaseUrl = process.env["SUPABASE_URL"]!;
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;

        const grant = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { "content-type": "application/json", apikey: serviceKey },
          body: JSON.stringify({ email: `${username}@app.local`, password }),
        });

        if (!grant.ok) {
          const { data: recorded } = await supabaseAdmin.rpc("check_and_record_login_attempt", {
            _username: username,
            _success: false,
          });
          const row = Array.isArray(recorded) ? recorded[0] : recorded;
          const retry = row && !row.allowed ? row.retry_after_seconds : 0;
          if (retry && retry > 0) {
            return json({ error: "Too many failed attempts.", retry_after_seconds: retry }, 429);
          }
          return json({ error: "Incorrect username or password." }, 401);
        }

        const tokens = (await grant.json()) as {
          access_token?: string;
          refresh_token?: string;
        };
        if (!tokens.access_token || !tokens.refresh_token) {
          return json({ error: "Incorrect username or password." }, 401);
        }

        await supabaseAdmin.rpc("check_and_record_login_attempt", {
          _username: username,
          _success: true,
        });

        return json(
          { access_token: tokens.access_token, refresh_token: tokens.refresh_token },
          200,
        );
      },
    },
  },
});
