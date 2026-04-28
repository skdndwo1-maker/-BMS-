import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { APP_DISPLAY_NAME } from "@/constants/appBranding";

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

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session?.user) navigate("/options");
    })();
  }, [sb, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <div className="min-h-screen flex" style={{ background: "#F0E9DF" }}>
      {/* Left panel — dark navy brand */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] shrink-0 flex-col justify-between px-12 py-12"
        style={{ background: "#1A2535" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 shrink-0">
            <img src="/uplus-main-logo.png" alt={APP_DISPLAY_NAME} className="h-full w-full object-contain" />
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">{APP_DISPLAY_NAME}</span>
        </div>

        <div>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5 text-xs font-medium"
            style={{ background: "rgba(244,49,130,0.18)", color: "#F87AB8" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#F43182] inline-block" />
            AI-Powered Brand Management
          </div>
          <h2
            className="font-bold leading-tight mb-4"
            style={{ fontSize: "32px", color: "#F0E9DF", letterSpacing: "-0.02em" }}
          >
            브랜드 디자인을<br />더 스마트하게
          </h2>
          <p style={{ color: "#8A9BB8", fontSize: "14px", lineHeight: 1.7 }}>
            브랜드 가이드라인 기반의 그래픽 제작,<br />
            AI 검수, 네이밍 검토, 에셋 라이브러리를<br />
            한 플랫폼에서 관리하세요.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {[
            { num: "4", label: "핵심 기능" },
            { num: "AI", label: "Gemini 연동" },
            { num: "∞", label: "에셋 관리" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex-1 rounded-xl px-3 py-3 text-center"
              style={{ background: "rgba(240,233,223,0.06)" }}
            >
              <div className="font-bold text-white text-lg leading-none mb-0.5">{item.num}</div>
              <div style={{ color: "#8A9BB8", fontSize: "11px" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-10">
          <div className="w-9 h-9 shrink-0">
            <img src="/uplus-main-logo.png" alt={APP_DISPLAY_NAME} className="h-full w-full object-contain" />
          </div>
          <span className="font-semibold text-lg" style={{ color: "#1A2535" }}>{APP_DISPLAY_NAME}</span>
        </div>

        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h1
              className="font-bold mb-1.5"
              style={{ fontSize: "26px", color: "#1A2535", letterSpacing: "-0.02em" }}
            >
              로그인
            </h1>
            <p style={{ color: "#8A8FA8", fontSize: "14px" }}>계정 정보를 입력하여 로그인하세요.</p>
          </div>

          <div
            className="rounded-2xl p-7 shadow-lg"
            style={{ background: "#FFFFFF", border: "1px solid rgba(26,37,53,0.08)" }}
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" style={{ color: "#1A2535", fontSize: "13px", fontWeight: 500 }}>
                  이메일
                </Label>
                <div className="relative">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                    style={{ color: "#8A8FA8" }}
                  />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 text-sm"
                    style={{
                      background: "#F5F0E8",
                      border: "1px solid rgba(26,37,53,0.10)",
                      borderRadius: "10px",
                      color: "#1A2535",
                    }}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" style={{ color: "#1A2535", fontSize: "13px", fontWeight: 500 }}>
                  비밀번호
                </Label>
                <div className="relative">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                    style={{ color: "#8A8FA8" }}
                  />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-11 text-sm"
                    style={{
                      background: "#F5F0E8",
                      border: "1px solid rgba(26,37,53,0.10)",
                      borderRadius: "10px",
                      color: "#1A2535",
                    }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: "#8A8FA8" }}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="text-right -mt-1">
                <button
                  type="button"
                  className="text-xs transition-colors hover:underline"
                  style={{ color: "#C8C2B8", fontWeight: 350 }}
                >
                  비밀번호 찾기
                </button>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 text-sm font-semibold transition-all shadow-sm"
                style={{
                  background: "#F43182",
                  color: "#FFFFFF",
                  borderRadius: "10px",
                  border: "none",
                }}
              >
                {isLoading ? "Signing In..." : "Sign In"}
              </Button>
            </form>

            <div
              className="mt-5 pt-5 text-center text-xs"
              style={{ borderTop: "1px solid rgba(26,37,53,0.08)", color: "#8A8FA8" }}
            >
              계정 발급은 IT 관리자에게 문의해주세요.
            </div>
          </div>

          <div className="mt-8 text-center" style={{ fontSize: "12px", color: "#A8A49C" }}>
            <p>© 2026 {APP_DISPLAY_NAME}. All rights reserved.</p>
            <div className="mt-1.5 space-x-3" style={{ fontSize: "10px" }}>
              <button type="button" className="transition-colors hover:underline" style={{ color: "#C8C2B8" }}>
                Privacy Policy
              </button>
              <span style={{ color: "#C8C2B8" }}>•</span>
              <button type="button" className="transition-colors hover:underline" style={{ color: "#C8C2B8" }}>
                Terms of Service
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
