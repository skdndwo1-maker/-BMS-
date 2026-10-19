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

/** useBlocker 등 data router API를 쓰기 위해 createBrowserRouter 사용 */
export const appRouter = createBrowserRouter([
  { path: "/", element: <LoginScreen /> },
  { path: "/options", element: <OptionSelection /> },
  { path: "/brand-graphics", element: <TemplateGallery /> },
  { path: "/create/:templateId", element: <DesignEditor /> },
  { path: "/dashboard", element: <MyDesignsDashboard /> },
  { path: "/inspection", element: <BrandInspection /> },
  { path: "/naming", element: <BrandNaming /> },
  { path: "/simply-heart", element: <SimplyHeart /> },
  { path: "/library", element: <BrandLibrary /> },
  { path: "/admin/review", element: <AdminReview /> },
  { path: "/admin/templates/:templateId/builder", element: <TemplateBuilder /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
