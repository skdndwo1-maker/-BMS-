import { Link, useLocation } from "react-router-dom";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";

const titles: Record<string, string> = {
  "/dashboard": "내 디자인",
  "/brand-graphics": "브랜드 디자인",
  "/inspection": "브랜드 디자인 검수",
  "/naming": "브랜드 네이밍",
  "/library": "브랜드 라이브러리",
};

export function FeaturePlaceholder() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? "페이지";

  return (
    <div className="min-h-screen brand-app-shell flex flex-col items-center justify-center gap-4 px-4">
      <AxisBrandTitle subtitle={title} />
      <p className="text-sm text-center max-w-md text-gray-500">이 기능은 준비 중입니다.</p>
      <Link
        to="/options"
        className="text-sm font-semibold text-[#C14D38] underline-offset-2 hover:underline"
      >
        옵션으로 돌아가기
      </Link>
    </div>
  );
}
