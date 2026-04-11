import { Link, useLocation } from "react-router-dom";

const titles: Record<string, string> = {
  "/dashboard": "내 디자인",
  "/brand-graphics": "브랜드 그래픽 제작",
  "/inspection": "브랜드 디자인 검수",
  "/naming": "브랜드 네이밍 검토",
  "/library": "브랜드 라이브러리",
};

export function FeaturePlaceholder() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? "페이지";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F8F8F9] px-4">
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      <p className="text-gray-500 text-sm text-center max-w-md">이 기능은 준비 중입니다.</p>
      <Link to="/options" className="text-[#F43182] hover:underline text-sm">
        옵션으로 돌아가기
      </Link>
    </div>
  );
}
