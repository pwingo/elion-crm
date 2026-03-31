function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get DATABASE_URL() { return requireEnv("DATABASE_URL"); },
  get NEXTAUTH_SECRET() { return requireEnv("NEXTAUTH_SECRET"); },
  get GOOGLE_CLIENT_ID() { return requireEnv("GOOGLE_CLIENT_ID"); },
  get GOOGLE_CLIENT_SECRET() { return requireEnv("GOOGLE_CLIENT_SECRET"); },
  get GOOGLE_REDIRECT_URI() { return requireEnv("GOOGLE_REDIRECT_URI"); },
  get ANTHROPIC_API_KEY() { return requireEnv("ANTHROPIC_API_KEY"); },
  get NEXT_PUBLIC_APP_URL() { return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"; },
  get ALLOWED_EMAILS() { return (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean); },
};
