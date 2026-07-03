// ============================================================
// FutureCut — NextAuth.js Configuration
// ============================================================
// Credentials-based auth with email/password stored in SQLite.
// ============================================================

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { queryOne, execute } from "./db";
import { v4 as uuidv4 } from "uuid";
import { authConfig } from "./auth.config";

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

        if (!email || !password) return null;

        if (action === "signup") {
          // Check if user already exists
          const existing = await queryOne<{ id: string }>(
            "SELECT id FROM users WHERE email = ?",
            [email]
          );

          if (existing) return null;

          const id = uuidv4();
          const passwordHash = await bcrypt.hash(password, 12);

          await execute(
            "INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)",
            [id, email, name || email.split("@")[0], passwordHash]
          );

          return { id, email, name: name || email.split("@")[0] };
        }

        // Sign in
        const user = await queryOne<{
          id: string;
          email: string;
          name: string;
          password_hash: string;
        }>("SELECT id, email, name, password_hash FROM users WHERE email = ?", [
          email,
        ]);

        if (!user) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
