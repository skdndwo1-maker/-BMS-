import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { apiUrl } from "@/lib/apiUrl.ts";

type InviteCodeScreenProps = {
  onVerified: () => void;
};

export function InviteCodeScreen({ onVerified }: InviteCodeScreenProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(apiUrl("/api/invite/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() })
      });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean };
      if (r.ok && data.ok) {
        sessionStorage.setItem("bms_invite_ok", "1");
        onVerified();
        return;
      }
      setError("접근 권한이 없습니다");
    } catch {
      setError("접근 권한이 없습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex flex-col items-center">
          <img
            src="/uplus-main-logo.png"
            alt="U+ AI 브랜드 Agent"
            className="h-16 rounded-xl w-auto object-contain mb-4 drop-shadow-sm"
          />
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">U+ AI 브랜드 Agent</h1>
          <p className="text-gray-500 font-regular tracking-wide">U+ Brand Contents Total Managing Platform</p>
        </div>

        <Card className="border-gray-200 shadow-lg">
          <div className="px-6 pt-6 pb-2 flex flex-col items-center text-center gap-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">초대코드</CardTitle>
            <CardDescription className="text-sm text-gray-500">배포된 초대코드를 입력해 주세요.</CardDescription>
          </div>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-code" className="text-sm text-gray-700">
                  초대코드
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="invite-code"
                    type="password"
                    autoComplete="off"
                    placeholder="초대코드 입력"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError(null);
                    }}
                    className="pl-10 h-12 border-gray-300 focus:border-[#FF2E99] focus:ring-[#FF2E99]"
                    required
                  />
                </div>
              </div>

              {error ? <p className="text-sm text-red-600 text-center">{error}</p> : null}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#FF2E99] hover:bg-[#D12170] text-white transition-all shadow-md"
              >
                {loading ? "확인 중…" : "확인"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>© 2026 LG U+. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
