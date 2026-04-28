import { ChevronLeft, User, Video } from "lucide-react";
import type { CanvasSize, DesignContent } from "@/design/types";
import { RCSCanvas } from "./RCSCanvas";

interface RCSPhoneMmsPreviewProps {
  content: DesignContent;
  canvasSize: CanvasSize;
  className?: string;
  /**
   * true면 검은 가짜 베젤 없이 화면만 렌더 — 갤럭시 목업 PNG 안에 넣을 때 사용
   */
  inDeviceFrame?: boolean;
}

function formatPreviewTimestamp(): string {
  const d = new Date();
  return d.toLocaleString("ko-KR", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * MMS/RCS 수신 화면 느낌의 프레임 안에 편집 중인 RCS 카드를 실시간으로 표시합니다.
 */
export function RCSPhoneMmsPreview({
  content,
  canvasSize,
  className = "",
  inDeviceFrame = false,
}: RCSPhoneMmsPreviewProps) {
  const body = (content.bodyText || "").trim();
  const bubbleText = body || "본문을 입력하면 문자 말풍선에도 함께 표시됩니다.";
  const compact = inDeviceFrame;

  const screen = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <header
        className={`flex shrink-0 items-center justify-between gap-1 border-b border-gray-100 ${compact ? "px-2 py-1.5" : "gap-2 px-3 py-2.5"}`}
      >
        <ChevronLeft
          className={`shrink-0 text-[#007AFF] ${compact ? "h-4 w-4" : "h-6 w-6"}`}
          strokeWidth={2.2}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
          <div
            className={`flex items-center justify-center rounded-full bg-gray-200 text-gray-500 ${compact ? "h-6 w-6" : "h-9 w-9"}`}
          >
            <User className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} strokeWidth={1.8} aria-hidden />
          </div>
          <span className={`font-medium text-gray-500 ${compact ? "text-[9px]" : "text-[11px]"}`}>MMS ›</span>
        </div>
        <Video className={`shrink-0 text-[#007AFF] ${compact ? "h-4 w-4" : "h-6 w-6"}`} strokeWidth={2} aria-hidden />
      </header>

      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${compact ? "px-1.5 pb-2 pt-1" : "px-3 pb-4 pt-2"}`}
      >
        <p className={`mb-2 text-center text-gray-400 ${compact ? "mb-1.5 text-[9px]" : "mb-3 text-[11px]"}`}>
          {formatPreviewTimestamp()}
        </p>

        <div className={`mx-auto mb-2 w-full ${compact ? "max-w-full" : "max-w-[220px]"}`}>
          <div
            className={`rounded-2xl border border-gray-200/90 bg-[#E8E8ED] shadow-inner ${compact ? "p-0.5" : "p-1"}`}
          >
            <div
              className={`w-full overflow-hidden bg-[#f0f0f2] ${compact ? "rounded-[10px]" : "rounded-[14px]"}`}
              style={{
                aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
              }}
            >
              <RCSCanvas
                content={content}
                canvasSize={canvasSize}
                zoom={1}
                workspaceDisplayScale={1}
                workspaceAlign="center"
                embed
                canvasElementId="rcs-phone-preview-canvas"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-start">
          <div
            className={`rounded-2xl rounded-tl-md bg-[#E9E9EB] text-left shadow-sm ${compact ? "max-w-full px-2 py-1.5" : "max-w-[min(100%,220px)] px-3 py-2"}`}
            style={{
              fontSize: compact ? 10 : 12,
              lineHeight: 1.45,
              color: "#1a1a1a",
            }}
          >
            {bubbleText.split("\n").map((line, i) => (
              <span key={i}>
                {i > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (inDeviceFrame) {
    return (
      <div
        className={`flex h-full min-h-0 w-full flex-col ${className}`}
        aria-label="MMS 수신 미리보기"
      >
        {screen}
      </div>
    );
  }

  return (
    <div
      className={`flex max-h-full min-h-0 w-full max-w-[260px] flex-col ${className}`}
      aria-label="MMS 수신 미리보기"
    >
      <div className="flex min-h-0 flex-1 flex-col rounded-[2.25rem] border border-gray-800 bg-[#0a0a0a] p-2 shadow-2xl">
        {screen}
      </div>
    </div>
  );
}
