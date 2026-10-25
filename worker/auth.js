/**
 * Google sign-in (stub until credentials exist). Guests do not need this: they are identified by a
 * device-held guest id (see room.js). When GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set and the
 * D1 binding `DB` exists, better-auth serves /api/auth/* (Google OAuth, sessions in D1).
 * Linking a Google account to the guest seat is the next step (better-auth `anonymous` plugin).
 */
export const googleEnabled = (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.DB && env.BETTER_AUTH_SECRET);

let cached = null;
export async function getAuth(env, request) {
  if (!googleEnabled(env)) return null;
  if (cached) return cached;
  const { betterAuth } = await import('better-auth');
  const { anonymous } = await import('better-auth/plugins');
  cached = betterAuth({
    database: env.DB, // D1 is detected natively (better-auth >= 1.5)
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || new URL(request.url).origin,
    socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } },
    plugins: [anonymous()],
  });
  return cached;
}
