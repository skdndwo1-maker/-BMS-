import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { APP_DISPLAY_NAME } from "@/constants/appBranding";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";

/** Reference: minimalist login — white bg, grey inputs, coral CTA (#FF7051) */
const PALETTE = {
  bg: "#FFFFFF",
  ink: "#0F1115",
  muted: "#6B7280",
  mutedSoft: "#9CA3AF",
  inputBg: "#E5E5E5",
  coral: "#FF7051",
  coralHover: "#E85E42",
} as const;

const font: React.CSSProperties = {
  fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
};

export function LoginScreen() {
  const navigate = useNavigate();
  const sb = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitHovered, setSubmitHovered] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session?.user) navigate("/options");
    })();
  }, [sb, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreeTerms) {
      toast.error("약관에 동의해 주세요.");
      return;
    }
    setIsLoading(true);
    try {
      if (!sb) {
        toast.error("Supabase 설정이 필요합니다. (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
        return;
      }
      const { data, error } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (!data.session?.user) throw new Error("로그인에 실패했습니다.");
      toast.success("로그인 완료");
      navigate("/options");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "로그인에 실패했습니다.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase: React.CSSProperties = {
    height: 52,
    padding: "0 16px",
    background: PALETTE.inputBg,
    border: "none",
    borderRadius: 12,
    fontSize: 15,
    color: PALETTE.ink,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    transition: "box-shadow 0.15s ease",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 16px 40px",
        boxSizing: "border-box",
        background: PALETTE.bg,
        ...font,
      }}
    >
      {/* 전체 화면 좌상단: AXIS + 부제 (compact 대비 약 10% 확대) */}
      <div
        style={{
          position: "fixed",
          top: "max(24px, env(safe-area-inset-top, 0px))",
          left: "max(24px, env(safe-area-inset-left, 0px))",
          zIndex: 2,
          transform: "scale(1.1)",
          transformOrigin: "left top",
          pointerEvents: "none",
        }}
      >
        <AxisBrandTitle
          subtitle="Brand Contents Manager"
          compact
          className="!flex-col !flex-nowrap !items-start !justify-start gap-1 self-start text-left indent-0 [column-gap:0] [&>span:first-child]:justify-start [&>span:last-child]:w-full [&>span:last-child]:text-left [&>span:last-child]:mt-px [&>span:last-child]:leading-snug [&>span:last-child]:font-normal [&>span:last-child]:text-[#9CA3AF]"
        />
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 440,
          background: "#FFFFFF",
          borderRadius: 24,
          padding: "36px 32px 28px",
          boxShadow: "0 4px 24px rgba(15, 17, 21, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)",
        }}
      >
      <div style={{ width: "100%" }}>
        <header style={{ width: "100%", marginBottom: 28, textAlign: "center" }}>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: PALETTE.ink,
              margin: "0 0 8px",
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
            }}
          >
            Log in
          </h1>
          <p style={{ fontSize: 15, color: PALETTE.muted, margin: 0, fontWeight: 400 }}>
            Enter your details to continue
          </p>
        </header>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label
              htmlFor="email"
              style={{ fontSize: 13, fontWeight: 700, color: PALETTE.ink, letterSpacing: "-0.01em" }}
            >
              Enter your email
            </label>
            <input
              id="email"
              type="email"
              placeholder="email@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputBase}
              onFocus={(e) => {
                e.target.style.boxShadow = `0 0 0 2px rgba(255, 112, 81, 0.35)`;
              }}
              onBlur={(e) => {
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <label
                htmlFor="password"
                style={{ fontSize: 13, fontWeight: 700, color: PALETTE.ink, letterSpacing: "-0.01em" }}
              >
                Enter your password
              </label>
              <button
                type="button"
                onClick={() => toast.info("비밀번호 재설정은 관리자에게 문의해 주세요.")}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: PALETTE.ink,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "none",
                  flexShrink: 0,
                }}
              >
                Recover password
              </button>
            </div>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  ...inputBase,
                  paddingRight: 48,
                }}
                onFocus={(e) => {
                  e.target.style.boxShadow = `0 0 0 2px rgba(255, 112, 81, 0.35)`;
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = "none";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                style={{
                  position: "absolute",
                  right: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: PALETTE.mutedSoft,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {showPassword ? (
                  <EyeOff style={{ width: 18, height: 18 }} />
                ) : (
                  <Eye style={{ width: 18, height: 18 }} />
                )}
              </button>
            </div>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              cursor: "pointer",
              fontSize: 13,
              color: PALETTE.ink,
              lineHeight: 1.45,
              fontWeight: 400,
            }}
          >
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              style={{
                width: 18,
                height: 18,
                marginTop: 2,
                flexShrink: 0,
                cursor: "pointer",
                accentColor: PALETTE.coral,
              }}
            />
            <span>
              I agree with{" "}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  toast.info("Terms 내용은 준비 중입니다.");
                }}
                style={{
                  font: "inherit",
                  color: PALETTE.ink,
                  textDecoration: "underline",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                Terms and Conditions
              </button>{" "}
              and{" "}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  toast.info("Privacy Policy 내용은 준비 중입니다.");
                }}
                style={{
                  font: "inherit",
                  color: PALETTE.ink,
                  textDecoration: "underline",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                Privacy Policy
              </button>
              .
            </span>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            onMouseEnter={() => setSubmitHovered(true)}
            onMouseLeave={() => setSubmitHovered(false)}
            style={{
              height: 52,
              background: submitHovered && !isLoading ? PALETTE.coralHover : PALETTE.coral,
              color: "#FFFFFF",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: isLoading ? "not-allowed" : "pointer",
              transition: "background 0.15s",
              opacity: isLoading ? 0.75 : 1,
              letterSpacing: "0.01em",
            }}
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>

          <p style={{ textAlign: "center", fontSize: 13, color: PALETTE.ink, margin: 0 }}>
            <span>I don&apos;t have an account? </span>
            <button
              type="button"
              onClick={() => toast.info("계정 발급은 IT 관리자에게 문의해 주세요.")}
              style={{
                font: "inherit",
                fontWeight: 600,
                color: PALETTE.ink,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Sign up
            </button>
          </p>
        </form>

        <div style={{ marginTop: 28, textAlign: "center" }}>
          <p style={{ fontSize: 12, color: PALETTE.muted, margin: "0 0 8px", lineHeight: 1.5 }}>
            계정 발급은 IT 관리자에게 문의해주세요.
          </p>
          <p style={{ fontSize: 11, color: PALETTE.mutedSoft, margin: 0 }}>
            © 2026 {APP_DISPLAY_NAME}. All rights reserved.
          </p>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => toast.info("Privacy Policy 내용은 준비 중입니다.")}
              style={{
                fontSize: 10,
                color: PALETTE.mutedSoft,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Privacy Policy
            </button>
            <span style={{ fontSize: 10, color: PALETTE.mutedSoft }}>•</span>
            <button
              type="button"
              onClick={() => toast.info("Terms 내용은 준비 중입니다.")}
              style={{
                fontSize: 10,
                color: PALETTE.mutedSoft,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Terms of Service
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
