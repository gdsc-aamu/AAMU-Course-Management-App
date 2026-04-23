"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  gold: "#F59E0B",
  purple: "#7C3AED",
  error: "#EF4444",
};

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const Logo = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
    <div style={{
      width: 42, height: 42, borderRadius: "50%", background: COLORS.primary,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: 0.5,
    }}>OT</div>
    <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.primary, letterSpacing: 1.5 }}>ON TRACK</span>
  </div>
);

const Input = ({ label, type: initType, placeholder, value, onChange, icon, error }: {
  label: string; type: string; placeholder: string; value: string;
  onChange: (v: string) => void; icon?: React.ReactNode; error?: string;
}) => {
  const [showPw, setShowPw] = useState(false);
  const isPw = initType === "password";
  const type = isPw && showPw ? "text" : initType;

  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>{label}</label>
      <div style={{ position: "relative" }}>
        {icon && (
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: COLORS.textMuted, display: "flex" }}>
            {icon}
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: "100%", padding: "12px 14px", paddingLeft: icon ? 42 : 14,
            paddingRight: isPw ? 42 : 14, border: `1.5px solid ${error ? COLORS.error : COLORS.border}`,
            borderRadius: 10, fontSize: 14, color: COLORS.text, background: COLORS.white,
            outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
          }}
          onFocus={e => e.target.style.borderColor = COLORS.primary}
          onBlur={e => e.target.style.borderColor = error ? COLORS.error : COLORS.border}
        />
        {isPw && (
          <button type="button" onClick={() => setShowPw(!showPw)} style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex",
          }}>
            <EyeIcon open={showPw} />
          </button>
        )}
      </div>
      {error && <p style={{ color: COLORS.error, fontSize: 12, margin: "4px 0 0" }}>{error}</p>}
    </div>
  );
};

const MailIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
const LockIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const UserIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;

const PasswordStrength = ({ password }: { password: string }) => {
  const checks = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
  const strength = checks.filter(c => c.met).length;
  const barColor = strength <= 1 ? COLORS.error : strength <= 2 ? COLORS.gold : strength <= 3 ? "#3B82F6" : COLORS.success;

  if (!password) return null;

  return (
    <div style={{ marginTop: -10, marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i < strength ? barColor : COLORS.border,
            transition: "background 0.3s",
          }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px" }}>
        {checks.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: c.met ? COLORS.success : COLORS.textMuted }}>
            {c.met ? <CheckIcon /> : <div style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${COLORS.border}` }} />}
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
};

const Divider = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
    <div style={{ flex: 1, height: 1, background: COLORS.border }} />
    <span style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500 }}>or continue with</span>
    <div style={{ flex: 1, height: 1, background: COLORS.border }} />
  </div>
);

const SocialButton = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
  <button type="button" onClick={onClick} style={{
    flex: 1, padding: "10px 0", border: `1.5px solid ${COLORS.border}`, borderRadius: 10,
    background: COLORS.white, cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 600, color: COLORS.text,
    transition: "all 0.2s",
  }}
    onMouseEnter={e => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = COLORS.textMuted; }}
    onMouseLeave={e => { e.currentTarget.style.background = COLORS.white; e.currentTarget.style.borderColor = COLORS.border; }}
  >{children}</button>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <rect x="1" y="1" width="10" height="10" fill="#F25022" />
    <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
    <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
    <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const [page, setPage] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; name?: string; confirmPw?: string }>({});
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: { email?: string; password?: string; name?: string; confirmPw?: string } = {};
    if (!email) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = "Enter a valid email";
    if (!password) e.password = "Password is required";
    if (page === "signup") {
      if (!name) e.name = "Full name is required";
      if (password && password.length < 8) e.password = "Must be at least 8 characters";
      if (!confirmPw) e.confirmPw = "Please confirm your password";
      else if (password !== confirmPw) e.confirmPw = "Passwords do not match";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    setAuthError("");

    try {
      if (page === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
          },
        });

        if (error) throw error;

        // Redirect to OTP verification page
        if (data.user && !data.session) {
          router.push(`/verify?email=${encodeURIComponent(email)}`);
        } else {
          router.push("/dashboard");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // Successful login — redirect to dashboard
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed. Please try again.";
      setAuthError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "azure") => {
    setAuthError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setAuthError(error.message);
    }
  };

  const switchPage = (p: string) => {
    setPage(p);
    setErrors({});
    setAuthError("");
    setPassword("");
    setConfirmPw("");
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <Logo />
          <h2 style={{ fontSize: 26, fontWeight: 800, color: COLORS.text, margin: "16px 0 6px" }}>
            {page === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p style={{ color: COLORS.textMuted, fontSize: 14, margin: "0 0 28px" }}>
            {page === "login"
              ? "Sign in with your AAMU email to continue"
              : "Sign up with your email to get started"}
          </p>

          {/* Auth Error Banner */}
          {authError && (
            <div style={{
              background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10,
              padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.error} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span style={{ fontSize: 13, color: "#991B1B", lineHeight: 1.5 }}>{authError}</span>
            </div>
          )}

          {/* Social Buttons — Supabase OAuth */}
        
          <Divider />

          {/* Form */}
          {page === "signup" && (
            <Input label="Full Name" type="text" placeholder="John Bulldog" value={name} onChange={setName} icon={<UserIcon />} error={errors.name} />
          )}
          <Input label="Email Address" type="email" placeholder="you@gmail.com" value={email} onChange={setEmail} icon={<MailIcon />} error={errors.email} />
          <Input label="Password" type="password" placeholder={page === "login" ? "Enter your password" : "Create a strong password"} value={password} onChange={setPassword} icon={<LockIcon />} error={errors.password} />
          {page === "signup" && <PasswordStrength password={password} />}
          {page === "signup" && (
            <Input label="Confirm Password" type="password" placeholder="Re-enter your password" value={confirmPw} onChange={setConfirmPw} icon={<LockIcon />} error={errors.confirmPw} />
          )}

          {page === "login" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, marginTop: -6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: COLORS.textMuted }}>
                <div onClick={() => setRemember(!remember)} style={{
                  width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${remember ? COLORS.primary : COLORS.border}`,
                  background: remember ? COLORS.primary : COLORS.white, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", transition: "all 0.2s",
                }}>
                  {remember && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </div>
                Remember me
              </label>
              <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: 13, color: COLORS.primary, textDecoration: "none", fontWeight: 600 }}>
                Forgot password?
              </a>
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} style={{
            width: "100%", padding: "13px 0", background: loading ? COLORS.primaryLight : COLORS.primary,
            color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer", transition: "all 0.2s",
            boxShadow: "0 2px 12px rgba(122,27,62,0.25)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = COLORS.primaryDark; }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.background = COLORS.primary; }}
          >
            {loading && (
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ animation: "spin 1s linear infinite" }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" fill="none" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            )}
            {loading ? (page === "login" ? "Signing in..." : "Creating account...") : (page === "login" ? "Sign In" : "Create Account")}
          </button>

          <p style={{ textAlign: "center", fontSize: 14, color: COLORS.textMuted, marginTop: 24 }}>
            {page === "login" ? "Don't have an account? " : "Already have an account? "}
            <a href="#" onClick={e => { e.preventDefault(); switchPage(page === "login" ? "signup" : "login"); }}
              style={{ color: COLORS.primary, textDecoration: "none", fontWeight: 700 }}>
              {page === "login" ? "Sign up" : "Sign in"}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}