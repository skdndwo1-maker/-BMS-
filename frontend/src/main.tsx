import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import "@fontsource/noto-sans-kr/korean-400.css";
import "@fontsource/noto-sans-kr/korean-500.css";
import "@fontsource/noto-sans-kr/korean-600.css";
import "@fontsource/noto-sans-kr/korean-700.css";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist/800.css";
import "./index.css";
import { appRouter } from "./AppGate.tsx";
import { AuthSessionProvider } from "@/contexts/AuthSessionContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthSessionProvider>
      <RouterProvider router={appRouter} />
      <Toaster position="top-center" richColors />
    </AuthSessionProvider>
  </StrictMode>
);
