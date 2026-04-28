import { useState } from "react";
import { Link } from "react-router-dom";
import "./App.css";
import { FigmaTsxPreview } from "./FigmaTsxPreview";
import { JsonImportView } from "./JsonImportView";
import { AxisBrandTitle } from "@/components/AxisBrandTitle";

type Tab = "tsx" | "json";

export function ImportViewer() {
  const [tab, setTab] = useState<Tab>("tsx");

  return (
    <div className="page">
      <header className="header">
        <div className="mb-3">
          <AxisBrandTitle subtitle="Figma Import" compact />
        </div>
        <h1 className="!text-lg !font-semibold !mt-0">Figma Import Viewer</h1>
        <p className="sub">
          Figma에서 내보낸 TSX는 <code>src/figma-import/</code>에 넣고, 아래 탭에서 미리보기 하세요.{" "}
          <Link to="/" className="text-[#FF7F66] hover:underline">
            로그인
          </Link>
        </p>
      </header>

      <div className="tabs" role="tablist" aria-label="뷰 선택">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tsx"}
          className={tab === "tsx" ? "tab active" : "tab"}
          onClick={() => setTab("tsx")}
        >
          Figma TSX
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "json"}
          className={tab === "json" ? "tab active" : "tab"}
          onClick={() => setTab("json")}
        >
          API JSON
        </button>
      </div>

      {tab === "tsx" ? (
        <section className="tabPanel">
          <FigmaTsxPreview />
        </section>
      ) : (
        <section className="tabPanel">
          <JsonImportView />
        </section>
      )}
    </div>
  );
}
