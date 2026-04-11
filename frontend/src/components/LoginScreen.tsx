import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export function LoginScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      navigate("/options");
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex flex-col items-center">
          <img
            src="/uplus-main-logo.png"
            alt="U+ Layer"
            className="h-16 rounded-xl w-auto object-contain mb-4 drop-shadow-sm"
          />
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">U+ Layer</h1>
          <p className="text-gray-500 font-regular tracking-wide">U+ Brand Contents Total Managing Platform</p>
        </div>

        <Card className="border-gray-200 shadow-lg">
          <div className="px-6 pt-6 pb-2 flex flex-col items-center text-center gap-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">로그인</CardTitle>
            <CardDescription className="text-sm text-gray-500">
              계정 정보를 입력하여 로그인하세요.
            </CardDescription>
          </div>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm text-gray-700">
                  이메일
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 border-gray-300 focus:border-[#FF2E99] focus:ring-[#FF2E99]"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm text-gray-700">
                  비밀번호
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-12 border-gray-300 focus:border-[#FF2E99] focus:ring-[#FF2E99]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="text-right">
                <button
                  type="button"
                  className="text-xs text-[#D3D3D3] hover:text-[#B0B0B0] hover:underline transition-colors"
                  style={{ fontWeight: 350 }}
                >
                  비밀번호 찾기
                </button>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-[#FF2E99] hover:bg-[#D12170] text-white transition-all shadow-md"
              >
                {isLoading ? "Signing In..." : "Sign In"}
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-gray-500">계정이 없으신가요?</span>
                </div>
              </div>

              <div className="text-center">
                <p className="text-xs text-gray-600">계정 발급은 IT 관리자에게 문의해주세요.</p>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>© 2026 LG U+. All rights reserved.</p>
          <div className="mt-1.5 space-x-3" style={{ fontSize: "6px" }}>
            <button type="button" className="text-gray-300 hover:text-gray-400 transition-colors">
              Privacy Policy
            </button>
            <span className="text-gray-300">•</span>
            <button type="button" className="text-gray-300 hover:text-gray-400 transition-colors">
              Terms of Service
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
