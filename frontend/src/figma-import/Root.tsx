/**
 * Figma에서 내보낸 TSX의 메인 컴포넌트를 여기서 내보내세요.
 *
 * 방법 A: 이 파일 내용을 Figma가 준 메인 프레임 컴포넌트 코드로 통째로 교체
 * 방법 B: 아래처럼 다른 파일에서 re-export
 *   export { default } from "./YourFrameName";
 */
export default function FigmaPlaceholder() {
  return (
    <div
      style={{
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        maxWidth: 640,
        lineHeight: 1.5
      }}
    >
      <h2 style={{ marginTop: 0 }}>Figma TSX 미리보기</h2>
      <p>
        <code>frontend/src/figma-import/</code> 폴더에 Figma가 준 <code>.tsx</code> (및 이미지 등) 파일을
        그대로 넣고, 이 <code>Root.tsx</code>가 메인 화면을 내보내도록 맞추면 오른쪽 탭에서 렌더됩니다.
      </p>
      <p style={{ opacity: 0.85 }}>
        import 경로가 <code>@/...</code> 이면 Vite에 <code>@ → src</code> alias를 이미 걸어 두었습니다.
      </p>
    </div>
  );
}
