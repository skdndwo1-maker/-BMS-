import { createBrowserRouter, Navigate } from "react-router-dom";
import { LoginScreen } from "@/components/LoginScreen";
import { OptionSelection } from "@/components/OptionSelection";
import { BrandInspection } from "@/components/BrandInspection";
import { BrandNaming } from "@/components/BrandNaming";
import { BrandLibrary } from "@/components/BrandLibrary";
import { TemplateGallery } from "@/components/TemplateGallery";
import { DesignEditor } from "@/components/design/DesignEditor";
import { AdminReview } from "@/components/AdminReview";
import { TemplateBuilder } from "@/components/admin/TemplateBuilder";
import { MyDesignsDashboard } from "@/components/MyDesignsDashboard";
import { SimplyHeart } from "@/components/SimplyHeart";
import { RequireAuth } from "@/components/RequireAuth";

function guarded(element: React.ReactNode) {
  return <RequireAuth>{element}</RequireAuth>;
}

/** useBlocker 등 data router API를 쓰기 위해 createBrowserRouter 사용 */
export const appRouter = createBrowserRouter([
  { path: "/", element: <LoginScreen /> },
  { path: "/options", element: guarded(<OptionSelection />) },
  { path: "/brand-graphics", element: guarded(<TemplateGallery />) },
  { path: "/create/:templateId", element: guarded(<DesignEditor />) },
  { path: "/dashboard", element: guarded(<MyDesignsDashboard />) },
  { path: "/inspection", element: guarded(<BrandInspection />) },
  { path: "/naming", element: guarded(<BrandNaming />) },
  { path: "/simply-heart", element: guarded(<SimplyHeart />) },
  { path: "/library", element: guarded(<BrandLibrary />) },
  { path: "/admin/review", element: guarded(<AdminReview />) },
  { path: "/admin/templates/:templateId/builder", element: guarded(<TemplateBuilder />) },
  { path: "*", element: <Navigate to="/" replace /> },
]);
