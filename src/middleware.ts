// ============================================================
// FutureCut — NextAuth Middleware
// ============================================================
// Redirects unauthenticated users to the sign-in page,
// and redirects signed-in users away from the sign-in page.
// ============================================================

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/signin");

  if (isAuthPage) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/signin", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/editor/:path*", "/signin"],
};
