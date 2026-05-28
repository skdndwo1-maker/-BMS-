import { Routes, Route, Navigate } from "react-router-dom";
import { LoginScreen } from "@/components/LoginScreen";
import { OptionSelection } from "@/components/OptionSelection";
import { BrandInspection } from "@/components/BrandInspection";
import { BrandNaming } from "@/components/BrandNaming";
import { BrandLibrary } from "@/components/BrandLibrary";
import { TemplateGallery } from "@/components/TemplateGallery";
import { DesignEditor } from "@/components/design/DesignEditor";
import { AdminReview } from "@/components/AdminReview";
import { MyDesignsDashboard } from "@/components/MyDesignsDashboard";
import { SimplyHeart } from "@/components/SimplyHeart";

export default function AppGate() {
  return (
    <Routes>
      <Route path="/" element={<LoginScreen />} />
      <Route path="/options" element={<OptionSelection />} />
      <Route path="/brand-graphics" element={<TemplateGallery />} />
      <Route path="/create/:templateId" element={<DesignEditor />} />
      <Route path="/dashboard" element={<MyDesignsDashboard />} />
      <Route path="/inspection" element={<BrandInspection />} />
      <Route path="/naming" element={<BrandNaming />} />
      <Route path="/simply-heart" element={<SimplyHeart />} />
      <Route path="/library" element={<BrandLibrary />} />
      <Route path="/admin/review" element={<AdminReview />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
