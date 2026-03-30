"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const COLORS = {
  primary: "#7A1B3E",
  primaryDark: "#5C1430",
  primaryLight: "#9B2D54",
  bg: "#F5F3F0",
  white: "#FFFFFF",
  text: "#1A1A2E",
  textMuted: "#6B7280",
  border: "#E5E7EB",
  success: "#10B981",
  error: "#EF4444",
};

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [otp, setOtp] = useState(["", "", "", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];

    // Handle paste of full code
    if (value.length > 1) {
      const digits = value.slice(0, 8).split("");
      digits.forEach((d, i) => {
        if (i + index < 8) newOtp[i + index] = d;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(index + digits.length, 7);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length !== 8) {
      setError("Please enter the full 8-digit code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "signup",
      });

      if (verifyError) throw verifyError;

      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Verification failed.";
      setError(message);
      setOtp(["", "", "", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError("");
    setResent(false);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (resendError) throw resendError;

      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to resend code.";
      setError(message);
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", background: COLORS.white, padding: 48, borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.06)", maxWidth: 420 }}>
          <h2 style={{ color: COLORS.text, margin: "0 0 12px", fontSize: 22 }}>Missing Email</h2>
          <p style={{ color: COLORS.textMuted, margin: "0 0 24px", fontSize: 14 }}>
            No email address provided. Please sign up first.
          </p>
          <button onClick={() => router.push("/login")} style={{
            padding: "10px 28px", background: COLORS.primary, color: "#fff", border: "none",
            borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>
            Go to Sign Up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: COLORS.white, padding: 48, borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.06)", maxWidth: 480, width: "100%", textAlign: "center" }}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%", background: COLORS.primary,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 15,
          }}>OT</div>
          <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.primary, letterSpacing: 1.5 }}>ON TRACK</span>
        </div>

        {success ? (
          <>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h2 style={{ color: COLORS.text, margin: "0 0 8px", fontSize: 22 }}>Email Verified!</h2>
            <p style={{ color: COLORS.textMuted, fontSize: 14 }}>Redirecting to your dashboard...</p>
          </>
        ) : (
          <>
            {/* Email icon */}
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#FDF2F8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
              </svg>
            </div>

            <h2 style={{ color: COLORS.text, margin: "0 0 8px", fontSize: 22 }}>Verify Your Email</h2>
            <p style={{ color: COLORS.textMuted, fontSize: 14, margin: "0 0 32px", lineHeight: 1.6 }}>
              We sent an 8-digit code to<br />
              <strong style={{ color: COLORS.text }}>{email}</strong>
            </p>

            {/* Error banner */}
            {error && (
              <div style={{
                background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10,
                padding: "10px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 8,
                textAlign: "left",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.error} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span style={{ fontSize: 13, color: "#991B1B" }}>{error}</span>
              </div>
            )}

            {/* Resent banner */}
            {resent && (
              <div style={{
                background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10,
                padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#065F46",
              }}>
                A new code has been sent to your email.
              </div>
            )}

            {/* OTP Inputs */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 28 }}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={digit}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  style={{
                    width: 42, height: 52, textAlign: "center", fontSize: 20, fontWeight: 700,
                    border: `2px solid ${digit ? COLORS.primary : COLORS.border}`,
                    borderRadius: 12, outline: "none", color: COLORS.text,
                    background: COLORS.white, transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = COLORS.primary}
                  onBlur={e => e.target.style.borderColor = digit ? COLORS.primary : COLORS.border}
                />
              ))}
            </div>

            {/* Verify button */}
            <button onClick={handleVerify} disabled={loading || otp.join("").length !== 8} style={{
              width: "100%", padding: "13px 0",
              background: otp.join("").length === 8 ? COLORS.primary : COLORS.border,
              color: otp.join("").length === 8 ? "#fff" : COLORS.textMuted,
              border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700,
              cursor: otp.join("").length === 8 && !loading ? "pointer" : "not-allowed",
              transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: otp.join("").length === 8 ? "0 2px 12px rgba(122,27,62,0.25)" : "none",
            }}>
              {loading && (
                <svg width="18" height="18" viewBox="0 0 24 24" style={{ animation: "spin 1s linear infinite" }}>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" fill="none" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
                </svg>
              )}
              {loading ? "Verifying..." : "Verify Email"}
            </button>

            {/* Resend */}
            <p style={{ marginTop: 24, fontSize: 13, color: COLORS.textMuted }}>
              Didn&apos;t receive a code?{" "}
              <button onClick={handleResend} disabled={resending} style={{
                background: "none", border: "none", color: COLORS.primary, fontWeight: 700,
                cursor: resending ? "not-allowed" : "pointer", fontSize: 13, padding: 0,
              }}>
                {resending ? "Sending..." : "Resend code"}
              </button>
            </p>

            {/* Back to login */}
            <p style={{ marginTop: 12, fontSize: 13 }}>
              <button onClick={() => router.push("/login")} style={{
                background: "none", border: "none", color: COLORS.textMuted,
                cursor: "pointer", fontSize: 13, padding: 0, textDecoration: "underline",
              }}>
                Back to login
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#F5F3F0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
        <p style={{ color: "#6B7280", fontSize: 14 }}>Loading...</p>
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}