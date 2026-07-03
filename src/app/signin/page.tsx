"use client";

// ============================================================
// FutureCut — Sign In / Sign Up Page
// ============================================================

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        name: isSignUp ? name : undefined,
        action: isSignUp ? "signup" : "signin",
        redirect: false,
      });

      if (result?.error) {
        setError(
          isSignUp
            ? "Could not create account. Email may already be in use."
            : "Invalid email or password."
        );
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
            FutureCut
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Browser-based video editor
          </p>
        </div>

        {/* Card */}
        <div className="p-6 rounded-xl bg-[var(--bg-panel)] border border-[var(--border)] shadow-2xl">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
            {isSignUp ? "Create Account" : "Welcome Back"}
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            {isSignUp
              ? "Sign up to start editing"
              : "Sign in to your account"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? "Please wait..."
                : isSignUp
                ? "Create Account"
                : "Sign In"}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-[var(--border)] text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
              }}
              className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
