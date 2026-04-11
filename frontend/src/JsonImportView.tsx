import { useEffect, useMemo, useState } from "react";

export function JsonImportView() {
  const [jsonText, setJsonText] = useState("");
  const [loadHint, setLoadHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/figma.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (!cancelled && text.trim()) {
          setJsonText(text);
          setLoadHint("Loaded /figma.json (run npm run fetch:figma to refresh).");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadHint(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { parsed, parseError } = useMemo(() => {
    if (!jsonText.trim()) return { parsed: null as unknown, parseError: null as string | null };
    try {
      return { parsed: JSON.parse(jsonText), parseError: null };
    } catch (e) {
      return {
        parsed: null,
        parseError: e instanceof Error ? e.message : String(e)
      };
    }
  }, [jsonText]);

  const frames: Array<any> = parsed?.frames ?? parsed?.content?.frames ?? [];
  const meta = parsed?.meta ?? parsed?.content?.meta;
  const input = parsed?.input ?? parsed?.content?.input;

  return (
    <>
      <header className="header">
        <h1>Figma Import Viewer</h1>
        <p className="sub">
          MCP의 <code>figma_import_from_url</code> 결과 JSON을 붙여 넣거나, 루트에서 <code>npm run fetch:figma</code>로 받은{" "}
          <code>/figma.json</code>을 자동으로 불러옵니다.
        </p>
        {loadHint && <p className="sub">{loadHint}</p>}
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Input JSON</h2>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder="여기에 MCP tool 결과(JSON)를 그대로 붙여넣기"
            spellCheck={false}
          />
          {parseError && <div className="error">JSON parse error: {parseError}</div>}
        </div>

        <div className="panel">
          <h2>Summary</h2>
          <div className="kv">
            <div className="k">fileKey</div>
            <div className="v">{input?.fileKey ?? "-"}</div>
            <div className="k">name</div>
            <div className="v">{meta?.name ?? "-"}</div>
            <div className="k">frames</div>
            <div className="v">{Array.isArray(frames) ? frames.length : 0}</div>
          </div>

          <h2>Frames</h2>
          <div className="frames">
            {Array.isArray(frames) && frames.length ? (
              frames.slice(0, 200).map((f, idx) => (
                <div className="frameRow" key={f.id ?? idx}>
                  <div className="frameName">
                    {f.name || "(unnamed)"} <span className="badge">{f.type}</span>
                  </div>
                  <div className="frameMeta">
                    <div>
                      <span className="muted">id</span> {f.id}
                    </div>
                    <div>
                      <span className="muted">path</span> {(f.path ?? []).join(" / ")}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="muted">프레임 목록이 없어요. MCP 응답(JSON) 전체를 붙여넣었는지 확인해 주세요.</div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
