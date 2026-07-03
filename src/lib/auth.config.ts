// ============================================================
// FutureCut — NextAuth.js Configuration (Edge Compatible)
// ============================================================
// Contains configuration settings compatible with the Edge Runtime
// (does not import database, fs, or native dependencies).
// ============================================================

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [], // Configuration providers are defined separately in auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "futurecut-dev-secret-change-in-prod",
} satisfies NextAuthConfig;
