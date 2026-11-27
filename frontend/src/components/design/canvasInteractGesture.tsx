import { createContext, useContext } from "react";

/** 캔버스 드래그·리사이즈를 작업 기록 1단계로 묶기 위한 콜백 */
export type CanvasInteractGestureApi = {
  start: () => void;
  end: () => void;
};

const noopApi: CanvasInteractGestureApi = { start: () => {}, end: () => {} };

export const CanvasInteractGestureContext = createContext<CanvasInteractGestureApi>(noopApi);

export function useCanvasInteractGesture(): CanvasInteractGestureApi {
  return useContext(CanvasInteractGestureContext);
}
