"use client";

import { createBrowserSupabase } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => {
    try {
      return createBrowserSupabase();
    } catch {
      return null;
    }
  }, []);
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("App is not configured.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.push("/home");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: "#0b0e11" }}
    >
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-light tracking-[0.35em]">STACK</h1>
        <p className="mt-3 text-center text-sm text-[#a8adb8]">Set a new password</p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-5">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.3em] text-[#a8adb8]">
              New password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full border border-[#2a2e36] bg-[#0b0e11] px-4 py-3 pr-12 text-sm text-[#fafafa] outline-none transition focus:border-[#fafafa]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a8adb8] transition hover:text-[#fafafa]"
              >
                {showPassword ? <EyeOff size={16} strokeWidth={1.25} /> : <Eye size={16} strokeWidth={1.25} />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.3em] text-[#a8adb8]">
              Confirm password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full border border-[#2a2e36] bg-[#0b0e11] px-4 py-3 text-sm text-[#fafafa] outline-none transition focus:border-[#fafafa]"
            />
          </div>

          {error ? <p className="text-xs text-rose-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#fafafa] px-6 py-3 text-xs font-medium uppercase tracking-[0.3em] text-[#0b0e11] transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
