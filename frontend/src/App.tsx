import { Navigate, Route, Routes } from "react-router-dom";
import { LoginScreen } from "@/components/LoginScreen";
import { OptionSelection } from "@/components/OptionSelection";
import { BrandInspection } from "@/components/BrandInspection";
import { BrandNaming } from "@/components/BrandNaming";
import { FeaturePlaceholder } from "@/components/FeaturePlaceholder";
import { TemplateGallery } from "@/components/TemplateGallery";
import { DesignEditor } from "@/components/design/DesignEditor";
import { ImportViewer } from "./ImportViewer";

export default function App() {
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
