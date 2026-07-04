// ============================================================
// FutureCut — NextAuth.js Configuration
// ============================================================
// Credentials-based auth with email/password stored in SQLite.
// ============================================================

import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { queryOne, execute } from "./db";
import { v4 as uuidv4 } from "uuid";
import { authConfig } from "./auth.config";

// ============================================================
// Distinct, user-facing auth error codes.
// NextAuth v5 surfaces `err.code` to the client as `result.error`,
// so the frontend can tell these apart instead of getting one
// generic message for every failure mode.
// ============================================================
class MissingFieldsError extends CredentialsSignin {
  code = "missing_fields";
}
class EmailInUseError extends CredentialsSignin {
  code = "email_in_use";
}
class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
}
class ServerError extends CredentialsSignin {
  code = "server_error";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        name: { label: "Name", type: "text" },
        action: { label: "Action", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        const name = credentials?.name as string;
        const action = credentials?.action as string;

        if (!email || !password) throw new MissingFieldsError();

        if (action === "signup") {
          let existing: { id: string } | undefined;
          try {
            existing = await queryOne<{ id: string }>(
              "SELECT id FROM users WHERE email = ?",
              [email]
            );
          } catch (err) {
            console.error("[auth] signup lookup failed:", err);
            throw new ServerError();
          }

          if (existing) throw new EmailInUseError();

          const id = uuidv4();
          const passwordHash = await bcrypt.hash(password, 12);

          try {
            await execute(
              "INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)",
              [id, email, name || email.split("@")[0], passwordHash]
            );
          } catch (err) {
            console.error("[auth] signup insert failed:", err);
            // A UNIQUE constraint violation on `email` means a genuine race
            // (two signups at once); anything else is an infra failure
            // (e.g. read-only or missing SQLite file on serverless).
            const message = err instanceof Error ? err.message : String(err);
            if (/unique/i.test(message)) throw new EmailInUseError();
            throw new ServerError();
          }

          return { id, email, name: name || email.split("@")[0] };
        }

        // Sign in
        let user:
          | { id: string; email: string; name: string; password_hash: string }
          | undefined;
        try {
          user = await queryOne<{
            id: string;
            email: string;
            name: string;
            password_hash: string;
          }>(
            "SELECT id, email, name, password_hash FROM users WHERE email = ?",
            [email]
          );
        } catch (err) {
          console.error("[auth] signin lookup failed:", err);
          throw new ServerError();
        }

        if (!user) throw new InvalidCredentialsError();

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) throw new InvalidCredentialsError();

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
