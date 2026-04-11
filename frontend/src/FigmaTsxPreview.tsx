import { Component, type ErrorInfo, type ReactNode, Suspense, lazy } from "react";

const FigmaRoot = lazy(() => import("./figma-import/Root"));

type Props = { children?: ReactNode };

class PreviewErrorBoundary extends Component<Props, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(err: Error) {
    return { message: err.message };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error(err, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="previewError">
          <div className="previewErrorTitle">Figma TSX 렌더링 오류</div>
          <pre className="previewErrorPre">{this.state.message}</pre>
          <p className="muted">import 경로·파일 위치·필요한 에셋이 모두 있는지 확인해 주세요.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function FigmaTsxPreview() {
  return (
    <PreviewErrorBoundary>
      <div className="tsxPreviewWrap">
        <Suspense fallback={<div className="muted">Loading Figma TSX…</div>}>
          <FigmaRoot />
        </Suspense>
      </div>
    </PreviewErrorBoundary>
  );
}
