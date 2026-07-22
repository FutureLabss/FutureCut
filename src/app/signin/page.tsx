"use client";

// ============================================================
// FutureCut — Sign In / Sign Up Page
// ============================================================

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

// Maps the `code` thrown by authorize() in src/lib/auth.ts to a
// user-facing message. Falls back to a generic message for anything
// unrecognized (e.g. NextAuth's own internal errors).
function getErrorMessage(code: string, isSignUp: boolean): string {
  switch (code) {
    case "email_in_use":
      return "Could not create account. That email is already in use.";
    case "invalid_credentials":
      return "Invalid email or password.";
    case "missing_fields":
      return "Please fill in all fields.";
    case "server_error":
      return "Something went wrong on our end. Please try again in a moment.";
    default:
      return isSignUp
        ? "Could not create account. Please try again."
        : "Could not sign in. Please try again.";
  }
}

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
        setError(getErrorMessage(result.error, isSignUp));
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
    <div className="min-h-screen relative flex items-center justify-center bg-mesh-cosmic px-4 overflow-hidden">
      {/* Background ambient lighting flares */}
      <div className="absolute w-96 h-96 bg-purple-600/20 rounded-full blur-3xl top-1/4 left-1/4 pointer-events-none" />
      <div className="absolute w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl bottom-1/4 right-1/4 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Glass Card */}
        <div className="p-8 sm:p-10 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-purple-500/30 shadow-[0_0_50px_rgba(147,51,234,0.25)]">
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <img
              src="/logo-icon.png"
              alt="FutureCut Logo"
              className="w-16 h-16 mx-auto mb-3 drop-shadow-[0_0_20px_rgba(59,130,246,0.8)]"
            />
            <h1 className="text-3xl font-bold text-white tracking-tight font-outfit">
              FutureCut Premium
            </h1>
            <h2 className="text-xl font-medium text-gray-200 mt-4">
              {isSignUp ? "Create Account" : "Welcome Back"}
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {isSignUp
                ? "Sign up for your Premium account"
                : "Sign in to your Premium account"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5 ml-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-white/[0.05] border border-purple-500/30 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30 transition-all shadow-inner"
                  placeholder="Enter your name"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5 ml-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-2xl bg-white/[0.05] border border-purple-500/50 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/40 transition-all shadow-inner"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5 ml-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-2xl bg-white/[0.05] border border-purple-500/30 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30 transition-all shadow-inner"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-2 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500 text-white text-base font-semibold shadow-[0_0_25px_rgba(168,85,247,0.4)] hover:shadow-[0_0_35px_rgba(168,85,247,0.6)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading
                ? "Please wait..."
                : isSignUp
                ? "Sign Up"
                : "Sign In"}
            </button>
          </form>

          {/* Links */}
          <div className="mt-6 text-center space-y-3">
            <div>
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Password reset instructions have been sent if registered.");
                }}
                className="text-xs text-gray-400 hover:text-purple-300 transition-colors underline underline-offset-4"
              >
                Forgot password?
              </a>
            </div>
            <div>
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError("");
                }}
                className="text-sm text-gray-300 hover:text-purple-300 transition-colors font-medium"
              >
                {isSignUp
                  ? "Already have an account? Sign in"
                  : "Don't have an account? Sign up"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
