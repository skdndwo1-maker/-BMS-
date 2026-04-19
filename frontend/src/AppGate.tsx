import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LoginScreen } from "@/components/LoginScreen";
import { InviteCodeScreen } from "@/components/InviteCodeScreen";
import { OptionSelection } from "@/components/OptionSelection";
import { BrandInspection } from "@/components/BrandInspection";
import { BrandNaming } from "@/components/BrandNaming";
import { FeaturePlaceholder } from "@/components/FeaturePlaceholder";
import { TemplateGallery } from "@/components/TemplateGallery";
import { DesignEditor } from "@/components/design/DesignEditor";
import { ImportViewer } from "./ImportViewer";
import { apiUrl } from "@/lib/apiUrl.ts";

export default function AppGate() {
  const [phase, setPhase] = useState<"loading" | "invite" | "app">("loading");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (sessionStorage.getItem("bms_invite_ok") === "1") {
        if (!cancelled) setPhase("app");
        return;
      }
      try {
        const r = await fetch(apiUrl("/api/invite/status"));
        const data = (await r.json().catch(() => ({}))) as { required?: boolean };
        if (cancelled) return;
        if (!data.required) {
          sessionStorage.setItem("bms_invite_ok", "1");
          setPhase("app");
          return;
        }
        setPhase("invite");
      } catch {
        if (!cancelled) setPhase("invite");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <p className="text-sm text-gray-500">로딩 중…</p>
      </div>
    );
  }

  if (phase === "invite") {
    return <InviteCodeScreen onVerified={() => setPhase("app")} />;
  }

  return (
    <Routes>
      <Route path="/" element={<LoginScreen />} />
      <Route path="/options" element={<OptionSelection />} />
      <Route path="/brand-graphics" element={<TemplateGallery />} />
      <Route path="/create/:templateId" element={<DesignEditor />} />
      <Route path="/dashboard" element={<FeaturePlaceholder />} />
      <Route path="/inspection" element={<BrandInspection />} />
      <Route path="/naming" element={<BrandNaming />} />
      <Route path="/library" element={<FeaturePlaceholder />} />
      <Route path="/import" element={<ImportViewer />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
