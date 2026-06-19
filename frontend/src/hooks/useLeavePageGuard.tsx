import { useCallback, useEffect, useState } from "react";
import { useBlocker, useBeforeUnload } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type LeavePageGuardOptions = {
  /** true일 때만 라우터·브라우저 이탈을 차단합니다 */
  enabled: boolean;
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

/**
 * SPA 내비게이션(useBlocker) + 탭 닫기·새로고침(beforeunload) 이탈 확인.
 * 커스텀 모달을 반환하므로 페이지 JSX 루트에 `{leaveConfirmDialog}`를 렌더하세요.
 */
export function useLeavePageGuard({
  enabled,
  title = "페이지를 나가시겠습니까?",
  description,
  confirmLabel = "나가기",
  cancelLabel = "취소",
}: LeavePageGuardOptions) {
  const blocker = useBlocker(enabled);
  const [open, setOpen] = useState(false);

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!enabled) return;
        event.preventDefault();
        event.returnValue = "";
      },
      [enabled],
    ),
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      setOpen(true);
    } else if (blocker.state === "unblocked") {
      setOpen(false);
    }
  }, [blocker.state]);

  useEffect(() => {
    if (!enabled && blocker.state === "blocked") {
      blocker.reset();
      setOpen(false);
    }
  }, [enabled, blocker]);

  const handleStay = useCallback(() => {
    setOpen(false);
    if (blocker.state === "blocked") {
      blocker.reset();
    }
  }, [blocker]);

  const handleLeave = useCallback(() => {
    setOpen(false);
    if (blocker.state === "blocked") {
      blocker.proceed();
    }
  }, [blocker]);

  const leaveConfirmDialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleStay();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          handleStay();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-[14px] leading-relaxed text-gray-600">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleStay}>
            {cancelLabel}
          </Button>
          <Button type="button" className="brand-btn-primary" onClick={handleLeave}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { leaveConfirmDialog };
}
