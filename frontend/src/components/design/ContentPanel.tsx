import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import type { DesignContent, DesignStyle, LogoPosition, PosterCategory, AssetLayer, AssetType } from "@/design/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Upload, Image as ImageIcon, Sparkles, Calendar, MapPin, Type,
  AlignLeft,
  CornerDownLeft, CornerDownRight, CornerUpLeft, CornerUpRight,
  ChevronDown, ChevronUp, Settings, Shapes, Trash2, Eye, EyeOff, Plus,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DEFAULT_POSTER_BG_RECT,
  DEFAULT_POSTER_BADGE_RECT,
  DEFAULT_POSTER_SUBTITLE_RECT,
  DEFAULT_POSTER_SUBTITLE_OFFSET_Y,
  DEFAULT_POSTER_BODY_EXTRA_1,
  DEFAULT_POSTER_BODY_EXTRA_2,
} from "@/design/posterDefaults";
import { adjustBoldRangesOnPlainReplace } from "@/design/bodyBoldRanges";
import { PICTOGRAM_PRESETS, filterAssetPresets } from "@/design/assetPresets";
import { AssetPresetPickerDialog } from "@/components/design/AssetPresetPickerDialog";

interface ContentPanelProps {
  content: DesignContent;
  onContentChange: (content: DesignContent) => void;
  onShowQuickStart?: () => void;
  templateId?: string;
  focusTarget?: import("./DesignCanvas").DesignFocusTarget;
}

const POSTER_IDS = [
  'poster-a4','poster-a3','poster-a2','poster-a1','poster-a5',
  'a1-poster','a2-poster','a3-poster',
  'notice-a4','notice-a1','notice-half',
];

const PLACARD_IDS = [
  'placard-wide-landscape','placard-1000x600','placard-2000x1000','placard-600x1800',
];

function PosterBodyTextarea({
  value,
  onChange,
  boldRanges,
  onBoldRangesChange,
  rows = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  boldRanges?: Array<{ start: number; end: number }>;
  onBoldRangesChange: (ranges: Array<{ start: number; end: number }>) => void;
  rows?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const prevPlain = useRef(value);
  useEffect(() => {
    prevPlain.current = value;
  }, [value]);

  return (
    <div className="space-y-1.5">
      <Textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          const newPlain = e.target.value;
          const nextRanges = adjustBoldRangesOnPlainReplace(prevPlain.current, newPlain, boldRanges ?? []);
          prevPlain.current = newPlain;
          onChange(newPlain);
          onBoldRangesChange(nextRanges);
        }}
        placeholder={"줄바꿈(Enter)으로 문단 구분\n예)\n5G 초고속 네트워크\n캔버스에서 본문을 선택한 뒤 좌측 「텍스트 옵션」에서 굵게 등을 적용할 수 있습니다"}
        rows={rows}
        className="resize-none"
      />
    </div>
  );
}

const POSTER_CATEGORIES: {
  key: PosterCategory; label: string; emoji: string; color: string;
  preset: Partial<DesignContent>;
}[] = [
  { key: "basic", label: "기본형", emoji: "📄", color: "#6B7280", preset: { backgroundColor: "#FFFFFF", titleColor: "#1A1A1A", subtitle: "", title: "", bodyText: "", emphasizedTitle: "" } },
  { key: "notice", label: "공지사항", emoji: "📢", color: "#3B82F6", preset: { backgroundColor: "#FFFFFF", titleColor: "#1A1A1A", subtitle: "안내", title: "LG U+ 공지사항.", bodyText: "서비스 점검 및 일정 안내\n자세한 내용은 홈페이지를 참고하세요", emphasizedTitle: "※ 일정은 사정에 따라 변경될 수 있습니다." } },
  { key: "new-product", label: "신제품 출시", emoji: "📱", color: "#1A1A1A", preset: { backgroundColor: "#000000", titleColor: "#FFFFFF", subtitle: "신제품 출시", title: "새로운 시작.", bodyText: "최신 단말 출시\n단독 특가\n사전예약 진행 중", emphasizedTitle: "※ 실제 제품 색상은 화면과 다를 수 있습니다." } },
  { key: "promotion", label: "프로모션", emoji: "🎁", color: "#F43182", preset: { backgroundColor: "#F43182", titleColor: "#FFFFFF", subtitle: "특별 혜택", title: "특별 혜택을 드립니다.", bodyText: "가입 즉시 혜택 제공\n최대 할인\n사은품 증정", emphasizedTitle: "※ 본 프로모션은 기간 한정으로 조기 종료될 수 있습니다." } },
  { key: "plan-benefit", label: "요금&혜택", emoji: "💰", color: "#8B5CF6", preset: { backgroundColor: "#FFF0F5", titleColor: "#1A1A1A", subtitle: "요금 안내", title: "합리적인 요금제.", bodyText: "월 요금부터\n데이터 혜택\n가족 결합 할인", emphasizedTitle: "※ 부가세 포함 금액이며 약정 조건에 따라 상이합니다." } },
];

function normalizePosterCategory(k: string | undefined): PosterCategory {
  if (!k) return "basic";
  if (k === "service") return "notice";
  if (k === "mobile-launch") return "new-product";
  return k as PosterCategory;
}

function createAssetLayer(src: string, type: AssetType, name: string): AssetLayer {
  return {
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    type, src, name,
    x:0.1, y:0.1, width:0.2, height:0.2,
    visible:true, locked:false, opacity:1, rotation:0,
  };
}

export function ContentPanel({ content, onContentChange, onShowQuickStart, templateId, focusTarget }: ContentPanelProps) {
  const [imagePreview,        setImagePreview]        = useState<string|null>(null);
  const [logoPreview,         setLogoPreview]         = useState<string|null>(null);
  const [showCategoryPalette, setShowCategoryPalette] = useState(false);
  const [showTitleOptions,    setShowTitleOptions]    = useState(false);

  const refBadge = useRef<HTMLDivElement>(null);
  const refTitle = useRef<HTMLDivElement>(null);
  const refBody = useRef<HTMLDivElement>(null);
  const refFooter = useRef<HTMLDivElement>(null);
  const refImage = useRef<HTMLDivElement>(null);
  const refLogo = useRef<HTMLDivElement>(null);

  const [pictoDialogOpen, setPictoDialogOpen] = useState(false);

  useEffect(() => {
    if (!focusTarget) return;
    const scroll = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (focusTarget === "badge") scroll(refBadge.current);
    else if (focusTarget === "title") scroll(refTitle.current);
    else if (focusTarget === "body") scroll(refBody.current);
    else if (typeof focusTarget === "string" && focusTarget.startsWith("body:")) scroll(refBody.current);
    else if (typeof focusTarget === "string" && focusTarget.startsWith("subtitle:")) scroll(refTitle.current);
    else if (focusTarget === "footer") scroll(refFooter.current);
    else if (focusTarget === "image") scroll(refImage.current);
    else if (focusTarget === "logo") scroll(refLogo.current);
  }, [focusTarget]);

  /** posterBodies.body-1 텍스트가 비어 있는데 bodyText만 남아 있으면(레거시 불일치) 본문 입력란이 비어 보이는 문제 방지 */
  useEffect(() => {
    if (!POSTER_IDS.includes(templateId ?? "")) return;
    const blocks = content.posterBodies;
    if (!blocks?.length) return;
    const b1 = blocks.find((x) => x.id === "body-1");
    if (!b1 || (b1.text ?? "").length > 0) return;
    const leg = (content.bodyText ?? "").trim();
    if (!leg.length) return;
    onContentChange({
      ...content,
      posterBodies: blocks.map((x) => (x.id === "body-1" ? { ...x, text: leg } : x)),
    });
  }, [templateId, content, onContentChange]);

  const isPlacard     = PLACARD_IDS.includes(templateId ?? '');
  const isPoster      = POSTER_IDS.includes(templateId ?? '');
  const isContentEmpty = !content.title && !content.subtitle && !content.bodyText;
  const assetLayers   = content.assetLayers ?? [];

  const onAssetDrop = useCallback((files: File[], type: AssetType) => {
    const newAssets = files.map(f => createAssetLayer(URL.createObjectURL(f), type, f.name));
    onContentChange({ ...content, assetLayers: [...assetLayers, ...newAssets] });
  }, [content, assetLayers, onContentChange]);

  const { getRootProps:getImageRP,  getInputProps:getImageIP,  isDragActive:isImageDrag  } = useDropzone({ onDrop:(f)=>{ if(f[0]){
    onContentChange({
      ...content,
      image:f[0],
      posterBackgroundImageRect: content.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT,
      posterImageOpacity: content.posterImageOpacity ?? 100,
    });
    setImagePreview(URL.createObjectURL(f[0]));
  }}, accept:{"image/*":[".png",".jpg",".jpeg",".webp"]}, multiple:false });
  const { getRootProps:getLogoRP,   getInputProps:getLogoIP,   isDragActive:isLogoDrag   } = useDropzone({ onDrop:(f)=>{ if(f[0]){ onContentChange({...content,logo:f[0]});  setLogoPreview(URL.createObjectURL(f[0]));  }}, accept:{"image/*":[".png",".jpg",".jpeg",".svg"]},  multiple:false });

  const handleCategorySelect = (cat: typeof POSTER_CATEGORIES[number]) => {
    const bt = cat.preset.bodyText ?? "";
    onContentChange({
      ...content,
      posterCategory: cat.key,
      ...cat.preset,
      bodyText: bt,
      posterBodies: [{ id: "body-1", text: bt }],
    });
    setShowCategoryPalette(false);
  };

  const toggleAssetVisible = (id:string) => onContentChange({ ...content, assetLayers: assetLayers.map(a=>a.id===id?{...a,visible:!a.visible}:a) });
  const deleteAsset        = (id:string) => onContentChange({ ...content, assetLayers: assetLayers.filter(a=>a.id!==id) });

  // ── 공통 컴포넌트 ─────────────────────────────────────────────────

  const LogoSelector = () => (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold text-gray-700">로고 종류 선택</Label>
        <p className="text-xs text-gray-400">CI / BI / SLOGAN 중 선택</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            { key: null, label: "None", desc: "로고 없음" },
            { key: "CI", label: "CI", desc: "Corporate Identity" },
            { key: "BI", label: "BI", desc: "Brand Identity" },
            { key: "SLOGAN", label: "SLOGAN", desc: "슬로건 로고" },
          ] as const
        ).map((opt) => {
          const active = (content.logoOption ?? null) === opt.key;
          return (
            <button
              key={opt.key ?? "none"}
              type="button"
              onClick={() => onContentChange({ ...content, logoOption: opt.key as DesignContent["logoOption"] })}
              className={`rounded-xl border-2 px-2 py-3 text-center transition-all ${
                active ? "border-[#F43182] bg-[#F43182]/6" : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <p className={`text-sm font-bold leading-tight ${active ? "text-[#F43182]" : "text-gray-800"}`}>{opt.label}</p>
              <p className="mt-1 text-[9px] text-gray-400 leading-tight">{opt.desc}</p>
            </button>
          );
        })}
      </div>
      <div {...getLogoRP()} className={`border border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${isLogoDrag?"border-[#F43182] bg-[#F43182]/5":"border-gray-300 hover:border-gray-400"}`}>
        <input {...getLogoIP()} />
        {logoPreview
          ? <div className="flex items-center justify-center gap-3"><img src={logoPreview} alt="Logo" className="max-h-10"/><p className="text-xs text-gray-500">클릭하여 교체</p></div>
          : <div className="flex items-center justify-center gap-2 text-gray-400"><Upload className="w-4 h-4"/><p className="text-xs">직접 업로드 (위 옵션 덮어씌움)</p></div>}
      </div>
    </div>
  );

  const LogoPositionSelector = () => (
    <div className="space-y-3">
      <Label className="text-sm font-semibold text-gray-700">로고 배치 위치</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { key: "top-left" as LogoPosition, label: "좌상단", icon: CornerUpLeft },
          { key: "top-right" as LogoPosition, label: "우상단", icon: CornerUpRight },
          { key: "bottom-left" as LogoPosition, label: "좌하단", icon: CornerDownLeft },
          { key: "bottom-right" as LogoPosition, label: "우하단", icon: CornerDownRight },
        ].map((pos) => {
          const Icon=pos.icon; const active=content.logoPosition===pos.key;
          return (
            <button key={pos.key} onClick={()=>onContentChange({...content,logoPosition:pos.key})}
              className={`flex flex-col items-center gap-1.5 rounded-lg border-2 py-3 px-2 text-center transition-all ${active?"border-[#F43182] bg-[#F43182]/6":"border-gray-200 hover:border-gray-300 bg-white"}`}>
              <Icon className={`w-4 h-4 ${active?"text-[#F43182]":"text-gray-600"}`}/>
              <p className={`text-xs font-medium ${active?"text-[#F43182]":"text-gray-700"}`}>{pos.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const AssetSection = () => (
    <div className="border-t border-gray-100 pt-4 space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">에셋 (픽토그램)</p>
      <p className="text-xs text-gray-400">업로드 후 캔버스 위에서 자유롭게 이동 · 리사이즈 가능</p>

      {/* 픽토그램 */}
      <div className="space-y-1.5">
        <div className="flex items-end justify-between gap-2">
          <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Shapes className="w-3.5 h-3.5"/>픽토그램</Label>
          <Button type="button" variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setPictoDialogOpen(true)}>
            픽토그램 선택
          </Button>
        </div>
        <p className="text-xs text-gray-400">버튼을 눌러 팝업에서 검색·선택하세요</p>
      </div>

      {/* 업로드된 에셋 목록 */}
      {assetLayers.length>0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500">업로드된 에셋 ({assetLayers.length})</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {assetLayers.map((asset)=>(
              <div key={asset.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-200">
                <img src={asset.src} alt={asset.name} className="w-8 h-8 object-contain rounded shrink-0 bg-white border border-gray-100"/>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{asset.name||asset.type}</p>
                  <p className="text-[10px] text-gray-400">{asset.type}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={()=>toggleAssetVisible(asset.id)} className="p-1 rounded hover:bg-gray-200 transition-colors">
                    {asset.visible?<Eye className="w-3.5 h-3.5 text-gray-500"/>:<EyeOff className="w-3.5 h-3.5 text-gray-400"/>}
                  </button>
                  <button onClick={()=>deleteAsset(asset.id)} className="p-1 rounded hover:bg-red-100 transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-red-400"/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0"/>
        <p className="text-[10px] text-gray-400 leading-relaxed">브랜드 라이브러리 연동 후 저장된 에셋을 바로 불러와 사용할 수 있습니다</p>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  // ── 현수막 패널
  // ════════════════════════════════════════════════════════════════════
  if (isPlacard) {
    return (
      <div data-design-content-panel className="h-full overflow-y-auto p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-gray-900 mb-1">현수막 콘텐츠</h2>
          <p className="text-sm text-gray-500">LG U+ 브랜드 가이드 기반 현수막 서식</p>
        </div>
        <div className="bg-[#F43182]/8 border border-[#F43182]/25 rounded-lg p-3 flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-[#F43182] mt-0.5 shrink-0"/>
          <div className="text-xs text-gray-700">
            <p className="font-medium text-[#F43182] mb-0.5">LG U+ Brand Guideline 적용</p>
            <p>{templateId==='placard-wide-landscape'?'4700×700mm · 1X 그리드 · 좌측 CI/정보 · 우측 타이틀 중앙 정렬':templateId==='placard-1000x600'?'1000×600mm · 좌측 CI/정보 · 우측 타이틀 중앙 정렬':templateId==='placard-2000x1000'?'2000×1000mm · 좌측 CI/정보 · 우측 타이틀 중앙 정렬':'600×1800mm · 세로형 · 상단 CI · 중앙 타이틀'}</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">좌측 패널 — 로고 종류 선택</Label>
            <p className="text-xs text-gray-400">클릭 시 지정 위치에 자동 배치됩니다</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: "CI", title: "CI", desc: "Corporate Identity" },
                { key: "BI", title: "BI", desc: "Brand Identity" },
                { key: "SLOGAN", title: "SLOGAN", desc: "슬로건 로고" },
              ] as const
            ).map((opt) => {
              const active = (content.logoOption ?? "CI") === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onContentChange({ ...content, logoOption: opt.key })}
                  className={`rounded-xl border-2 px-2 py-3 text-center transition-all ${
                    active ? "border-[#F43182] bg-[#F43182]/6" : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <p className={`text-sm font-bold leading-tight ${active ? "text-[#F43182]" : "text-gray-800"}`}>{opt.title}</p>
                  <p className="mt-1 text-[9px] text-gray-400 leading-tight">{opt.desc}</p>
                </button>
              );
            })}
          </div>
          <div {...getLogoRP()} className={`border border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${isLogoDrag?"border-[#F43182] bg-[#F43182]/5":"border-gray-300 hover:border-gray-400"}`}>
            <input {...getLogoIP()}/>
            {logoPreview?(<div className="flex items-center justify-center gap-3"><img src={logoPreview} alt="Logo" className="max-h-10"/><p className="text-xs text-gray-500">클릭하여 교체</p></div>):(<div className="flex items-center justify-center gap-2 text-gray-400"><Upload className="w-4 h-4"/><p className="text-xs">직접 업로드 (위 옵션 덮어씌움)</p></div>)}
          </div>
        </div>
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <Label className="text-sm font-semibold text-gray-700">우측 패널 배경색</Label>
          <div className="grid grid-cols-2 gap-2">
            {([{key:"white",label:"백지",hex:"#FFFFFF",border:"#D4D4D4"},{key:"light-grey",label:"라이트 그레이",hex:"#F2F2F2",border:"#D4D4D4"},{key:"ivory",label:"아이보리",hex:"#FDFAF0",border:"#D9D5C0"},{key:"light-pink",label:"연핑크",hex:"#FFF0F5",border:"#F4B8D0"}] as const).map((opt)=>{
              const active=(content.rightPanelBg??"white")===opt.key;
              return (
                <button key={opt.key} onClick={()=>onContentChange({...content,rightPanelBg:opt.key})}
                  className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${active?"border-[#F43182] shadow-sm":"border-gray-200 hover:border-gray-300"}`}>
                  <span className="shrink-0 rounded-md" style={{width:22,height:22,background:opt.hex,border:`1.5px solid ${opt.border}`,display:"inline-block"}}/>
                  <span className={`text-xs font-medium ${active?"text-[#F43182]":"text-gray-700"}`}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">우측 패널 — 메인 타이틀</p>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Type className="w-3.5 h-3.5 text-gray-500"/>메인 타이틀 (일반)</Label>
            <Input value={content.title} onChange={(e)=>onContentChange({...content,title:e.target.value})} placeholder="예) LG유플러스 AI경영시스템" className="font-medium"/>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Type className="w-3.5 h-3.5 text-[#F43182]"/>메인 타이틀 강조 (마젠타)</Label>
            <Input value={content.emphasizedTitle||""} onChange={(e)=>onContentChange({...content,emphasizedTitle:e.target.value})} placeholder="예) 국제인증 획득" className="border-[#F43182]/40 focus:border-[#F43182] font-semibold"/>
          </div>
          <div className="space-y-2">
            <Label>본문 (우측 패널 하단 영역)</Label>
            <Textarea
              value={content.bodyText ?? ""}
              onChange={(e) => onContentChange({ ...content, bodyText: e.target.value })}
              placeholder="예) IEC 42001 인증 수여식"
              rows={5}
              className="resize-none min-h-[100px]"
            />
          </div>
        </div>
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">좌측 패널 — 날짜 · 장소</p>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-500"/>날짜</Label>
            <Input value={content.date||""} onChange={(e)=>onContentChange({...content,date:e.target.value})} placeholder="예) 2025.07.02(수)"/>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-500"/>장소</Label>
            <Input value={content.venue||""} onChange={(e)=>onContentChange({...content,venue:e.target.value})} placeholder="예) LG유플러스 울산 컨버전스 홀"/>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0"/>
            <div className="text-xs text-blue-900"><p className="font-medium mb-1">현수막 제작 가이드</p><ul className="space-y-1 text-blue-800"><li>• 메인 타이틀은 짧고 강렬하게 작성하세요</li><li>• 강조 텍스트는 2~4단어가 최적입니다</li><li>• 인쇄 시 300 DPI · CMYK 변환을 확인하세요</li></ul></div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── 포스터 패널
  // ════════════════════════════════════════════════════════════════════
  if (isPoster) {
    const currentCat=POSTER_CATEGORIES.find(c=>c.key===normalizePosterCategory(content.posterCategory))??POSTER_CATEGORIES[0];
    return (
      <div data-design-content-panel className="h-full overflow-y-auto p-6 space-y-6">
        <AssetPresetPickerDialog
          open={pictoDialogOpen}
          onOpenChange={setPictoDialogOpen}
          title="픽토그램 선택"
          presets={PICTOGRAM_PRESETS}
          filterPresets={filterAssetPresets}
          layout="picto"
          onPick={(p) => {
            const layer = createAssetLayer(p.src, "pictogram", p.name);
            onContentChange({ ...content, assetLayers: [...assetLayers, layer] });
            setPictoDialogOpen(false);
          }}
          onDropFiles={(files) => onAssetDrop(files, "pictogram")}
        />
        <div>
          <h2 className="font-semibold text-gray-900 mb-1">포스터 콘텐츠</h2>
          <div className="flex flex-col gap-1 mt-1">
            <p className="text-sm text-gray-500">LG U+ 브랜드 가이드 기반 포스터 서식</p>
            <span className="inline-flex items-center gap-1 bg-[#F43182]/10 border border-[#F43182]/25 rounded-full px-2 py-0.5 w-fit">
              <Sparkles className="w-3 h-3 text-[#F43182]"/><span className="text-[10px] font-medium text-[#F43182]">LG U+ Brand Guideline</span>
            </span>
          </div>
          <div className="mt-3 rounded-lg border border-gray-200 bg-slate-50 p-3 text-[11px] text-gray-700 leading-snug">
            <span className="font-semibold text-gray-900">우측 패널 텍스트 편집</span>
            <p className="mt-1">
              메인 타이틀·부제(최대 3)·본문(최대 3)·뱃지 문구·하단 유의사항을 이곳에서 모두 수정할 수 있습니다. 글꼴·크기·색 등 서식은 캔버스에서 텍스트를 선택한 뒤 좌측 하단 「텍스트 옵션」에서 조절합니다.
            </p>
          </div>
        </div>

        {/* 카테고리 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-gray-700">템플릿 카테고리</Label>
            <button onClick={()=>setShowCategoryPalette(!showCategoryPalette)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              {showCategoryPalette?<ChevronUp className="w-3.5 h-3.5"/>:<ChevronDown className="w-3.5 h-3.5"/>}{showCategoryPalette?'닫기':'변경'}
            </button>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition-all" style={{borderColor:currentCat.color,backgroundColor:`${currentCat.color}10`}} onClick={()=>setShowCategoryPalette(!showCategoryPalette)}>
            <span className="text-lg">{currentCat.emoji}</span>
            <div><p className="text-sm font-bold" style={{color:currentCat.color}}>{currentCat.label}</p><p className="text-[10px] text-gray-400">클릭하여 카테고리 변경</p></div>
            <ChevronDown className="w-4 h-4 ml-auto text-gray-400"/>
          </div>
          {showCategoryPalette&&(
            <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">카테고리 선택</p>
              {POSTER_CATEGORIES.map((cat)=>{
                const isActive=normalizePosterCategory(content.posterCategory)===cat.key;
                return (
                  <button key={cat.key} onClick={()=>handleCategorySelect(cat)}
                    className={`w-full flex items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-all ${isActive?'shadow-sm':'border-gray-200 hover:border-gray-300 bg-white'}`}
                    style={isActive?{borderColor:cat.color,backgroundColor:`${cat.color}10`}:{}}>
                    <span className="text-xl">{cat.emoji}</span>
                    <div className="flex-1"><p className="text-sm font-bold" style={{color:isActive?cat.color:'#374151'}}>{cat.label}</p><p className="text-[10px] text-gray-400">{cat.key==='basic'?'기본 빈 양식':cat.key==='notice'?'공지·안내 문구':cat.key==='new-product'?'신제품 런칭':cat.key==='promotion'?'이벤트 및 프로모션':'요금제 및 혜택 안내'}</p></div>
                    {isActive&&<span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{background:`${cat.color}20`,color:cat.color}}>선택됨</span>}
                  </button>
                );
              })}
              <p className="text-[10px] text-gray-400 mt-2">※ 선택 시 샘플 텍스트와 색상이 자동 적용됩니다</p>
            </div>
          )}
        </div>

        {/* 배경색 */}
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <Label className="text-sm font-semibold text-gray-700">배경색</Label>
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
            {[{label:"White",hex:"#FFFFFF",border:"#E5E5E5"},{label:"Grey",hex:"#F5F5F5",border:"#D1D1D1"},{label:"Ivory",hex:"#FDFAF0",border:"#D9D5C0"},{label:"Pink",hex:"#FFF0F5",border:"#F4B8D0"},{label:"Magenta",hex:"#F43182",border:"#F43182"},{label:"Black",hex:"#000000",border:"#000000"}].map((color)=>{
              const active=(content.backgroundColor||"#FFFFFF")===color.hex;
              return (
                <button key={color.hex} type="button" title={color.label} onClick={()=>onContentChange({...content,backgroundColor:color.hex})}
                  className={`shrink-0 flex flex-col items-center gap-0.5 rounded-md border-2 py-1 px-1.5 text-center transition-all ${active?"border-[#F43182] bg-[#F43182]/6":"border-gray-200 hover:border-gray-300 bg-white"}`}>
                  <span className="h-6 w-6 shrink-0 rounded-sm" style={{background:color.hex,border:`1px solid ${color.border}`}}/>
                  <span className={`max-w-[3.25rem] truncate text-[8px] font-medium leading-tight ${active?"text-[#F43182]":"text-gray-600"}`}>{color.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input type="color" value={content.backgroundColor||"#FFFFFF"} onChange={(e)=>onContentChange({...content,backgroundColor:e.target.value})} className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"/>
            <div className="flex-1 flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2">
              <span className="text-sm text-gray-400 font-mono">#</span>
              <input type="text" value={(content.backgroundColor||"#FFFFFF").replace("#","")} onChange={(e)=>{const v=e.target.value.replace(/[^0-9a-fA-F]/g,"").slice(0,6);if(v.length===6)onContentChange({...content,backgroundColor:`#${v}`});}} placeholder="F43182" className="flex-1 text-sm font-mono outline-none bg-transparent" maxLength={6}/>
            </div>
            <div className="w-10 h-10 rounded-lg border border-gray-300 shrink-0" style={{background:content.backgroundColor||"#FFFFFF"}}/>
          </div>
        </div>

        {/* 뱃지 */}
        <div ref={refBadge} className="space-y-2 border-t border-gray-100 pt-4">
          <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <span className="inline-block bg-[#F43182] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">뱃지</span>
            뱃지 텍스트
          </Label>
          <Input
            value={content.subtitle}
            onChange={(e) => {
              const v = e.target.value;
              onContentChange({
                ...content,
                subtitle: v,
                posterBadgeRect:
                  v.trim() && !content.posterBadgeRect ? DEFAULT_POSTER_BADGE_RECT : content.posterBadgeRect,
              });
            }}
            placeholder="예) 2025 신제품 출시"
          />
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">뱃지 색상</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "magenta" as const, label: "마젠타", bg: "#F43182" },
                  { key: "black" as const, label: "블랙", bg: "#000000" },
                ] as const
              ).map((opt) => {
                const active = (content.posterBadgeColor ?? "magenta") === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => onContentChange({ ...content, posterBadgeColor: opt.key })}
                    className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-left text-xs font-medium transition-all ${
                      active ? "border-[#F43182] bg-[#F43182]/6" : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <span className="h-6 w-6 rounded-md border border-gray-200" style={{ background: opt.bg }} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-gray-400">
            캔버스에서 뱃지 크기·위치를 드래그해 조절할 수 있습니다. 기본은 격자 높이 1칸·가로 3칸이며, 최소는 VI 한 칸 높이의 약 30%까지 줄일 수 있고 글자 크기도 함께 줄어듭니다. 가로를 줄이면 세로와 같아질 때까지(원형) 축소됩니다.
          </p>
        </div>

        {/* 메인 타이틀 · 부제 */}
        <div ref={refTitle} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-gray-500" />
              메인 타이틀
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-[12px] shrink-0"
              disabled={(content.posterSubtitles?.length ?? 0) >= 3}
              onClick={() => {
                const subs = content.posterSubtitles ?? [];
                if (subs.length >= 3) return;
                const id = `sub-${Date.now()}`;
                const idx = subs.length;
                onContentChange({
                  ...content,
                  posterSubtitles: [...subs, { id, text: "" }],
                  posterSubtitleRects: {
                    ...(content.posterSubtitleRects ?? {}),
                    [id]: {
                      ...DEFAULT_POSTER_SUBTITLE_RECT,
                      y: Math.min(
                        0.78,
                        DEFAULT_POSTER_SUBTITLE_RECT.y + idx * DEFAULT_POSTER_SUBTITLE_OFFSET_Y
                      ),
                    },
                  },
                });
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              부제 추가
            </Button>
          </div>
          {content.posterTitleOnCanvas === false && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-[#F43182]/35 bg-[#F43182]/5 px-3 py-2">
              <span className="text-[11px] text-gray-700">메인 타이틀 박스가 캔버스에서 숨겨져 있습니다.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[11px] shrink-0"
                onClick={() => onContentChange({ ...content, posterTitleOnCanvas: true })}
              >
                캔버스에 다시 표시
              </Button>
            </div>
          )}
          <Textarea
            value={content.title}
            onChange={(e) =>
              onContentChange({ ...content, title: e.target.value, posterTitleRectLocked: false })
            }
            placeholder={"예) 새로운 시작.\n(마침표로 끝나면 마젠타 점으로 변환)"}
            rows={3}
            className="font-medium resize-none"
          />
          <p className="text-xs text-gray-400">마침표(.)로 끝나면 마젠타 원형 포인트로 자동 변환됩니다</p>
          {(content.posterSubtitles ?? []).map((s, si) => (
            <div key={s.id} className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold text-gray-600">부제 {si + 1}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-red-600"
                  onClick={() => {
                    const nextSubs = (content.posterSubtitles ?? []).filter((x) => x.id !== s.id);
                    const { [s.id]: _removed, ...restRects } = content.posterSubtitleRects ?? {};
                    onContentChange({
                      ...content,
                      posterSubtitles: nextSubs,
                      posterSubtitleRects: restRects,
                    });
                  }}
                >
                  삭제
                </Button>
              </div>
              <Textarea
                value={s.text}
                onChange={(e) => {
                  const v = e.target.value;
                  onContentChange({
                    ...content,
                    posterSubtitles: (content.posterSubtitles ?? []).map((x) =>
                      x.id === s.id ? { ...x, text: v } : x
                    ),
                  });
                }}
                placeholder="부제 텍스트"
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          ))}
          <p className="text-xs text-gray-500 rounded-md border border-dashed border-gray-200 bg-gray-50/80 px-2 py-1.5">
            글꼴·크기·색·정렬·자간·행간·대소문자는 캔버스에서 해당 텍스트를 <span className="font-semibold text-gray-700">한 번 클릭</span>해 선택하면 툴바가 뜨고,{" "}
            <span className="font-semibold text-gray-700">더블클릭</span>하면 내용을 편집할 수 있습니다.
          </p>
        </div>

        {/* 본문 (최대 3블록) */}
        <div ref={refBody} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5 text-gray-500" />
              본문
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-[12px] shrink-0"
              disabled={(content.posterBodies?.length ?? 1) >= 3}
              onClick={() => {
                const blocks = content.posterBodies?.length
                  ? [...content.posterBodies]
                  : [{ id: "body-1", text: content.bodyText ?? "" }];
                if (blocks.length >= 3) return;
                const id = `body-${Date.now()}`;
                const idx = blocks.length;
                const rect = idx === 1 ? DEFAULT_POSTER_BODY_EXTRA_1 : DEFAULT_POSTER_BODY_EXTRA_2;
                onContentChange({
                  ...content,
                  posterBodies: [...blocks, { id, text: "" }],
                  posterBodyRects: { ...(content.posterBodyRects ?? {}), [id]: rect },
                });
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              추가
            </Button>
          </div>
          {content.posterBodyOnCanvas === false && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-[#F43182]/35 bg-[#F43182]/5 px-3 py-2">
              <span className="text-[11px] text-gray-700">본문 박스가 캔버스에서 숨겨져 있습니다.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[11px] shrink-0"
                onClick={() => onContentChange({ ...content, posterBodyOnCanvas: true })}
              >
                캔버스에 다시 표시
              </Button>
            </div>
          )}
          {(content.posterBodies?.length
            ? content.posterBodies
            : [{ id: "body-1", text: content.bodyText ?? "" }]
          ).map((b, bi) => (
            <div key={b.id} className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-semibold text-gray-600">본문 블록 {bi + 1}</Label>
                {b.id !== "body-1" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-red-600"
                    onClick={() => {
                      const blocks = (content.posterBodies ?? []).filter((x) => x.id !== b.id);
                      const { [b.id]: _r, ...rest } = content.posterBodyRects ?? {};
                      const { [b.id]: _rb, ...restBold } = content.posterBodyBoldRanges ?? {};
                      const nextBt = blocks[0]?.text ?? "";
                      onContentChange({
                        ...content,
                        posterBodies: blocks.length ? blocks : [{ id: "body-1", text: "" }],
                        posterBodyRects: rest,
                        posterBodyBoldRanges: restBold,
                        bodyText: nextBt,
                        posterBodyRect: content.posterBodyRects?.[blocks[0]?.id ?? "body-1"] ?? content.posterBodyRect,
                      });
                    }}
                  >
                    삭제
                  </Button>
                )}
              </div>
              <PosterBodyTextarea
                value={b.text}
                boldRanges={content.posterBodyBoldRanges?.[b.id]}
                onBoldRangesChange={(ranges) =>
                  onContentChange({
                    ...content,
                    posterBodyBoldRanges: { ...(content.posterBodyBoldRanges ?? {}), [b.id]: ranges },
                  })
                }
                onChange={(v) => {
                  const blocks = (content.posterBodies?.length
                    ? [...content.posterBodies]
                    : [{ id: "body-1", text: content.bodyText ?? "" }]
                  ).map((x) => (x.id === b.id ? { ...x, text: v } : x));
                  const lockedMap = { ...(content.posterBodyRectLocked ?? {}), [b.id]: false };
                  onContentChange({
                    ...content,
                    posterBodies: blocks,
                    bodyText: blocks[0]?.id === "body-1" ? v : content.bodyText,
                    posterBodyRectLocked: lockedMap,
                  });
                }}
              />
            </div>
          ))}
          <p className="text-xs text-gray-500 rounded-md border border-dashed border-gray-200 bg-gray-50/80 px-2 py-1.5">
            서체·크기·정렬·부분 굵게 등은 캔버스에서 본문을 클릭해 좌측 「텍스트 옵션」에서 조절합니다. (더블클릭으로 본문 편집)
          </p>
        </div>

        {/* 유의사항 */}
        <div ref={refFooter} className="space-y-2">
          <Label className="text-sm font-semibold text-gray-700">하단 유의사항</Label>
          {content.posterFooterOnCanvas === false && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-[#F43182]/35 bg-[#F43182]/5 px-3 py-2">
              <span className="text-[11px] text-gray-700">유의사항 박스가 캔버스에서 숨겨져 있습니다.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[11px] shrink-0"
                onClick={() => onContentChange({ ...content, posterFooterOnCanvas: true })}
              >
                캔버스에 다시 표시
              </Button>
            </div>
          )}
          <Textarea
            value={content.emphasizedTitle || ""}
            onChange={(e) =>
              onContentChange({ ...content, emphasizedTitle: e.target.value, posterFooterRectLocked: false })
            }
            placeholder="예) ※ 본 이미지는 연출된 것입니다."
            rows={2}
            className="resize-none text-sm"
          />
          <p className="text-xs text-gray-400">하단 좌측에 작은 회색 글씨로 표시됩니다</p>
          <p className="text-xs text-gray-500 rounded-md border border-dashed border-gray-200 bg-gray-50/80 px-2 py-1.5">
            유의사항 서식도 캔버스에서 한 번 클릭(툴바)·더블클릭(편집)으로 조절합니다.
          </p>
        </div>

        {/* 로고 */}
        <div ref={refLogo} className="border-t border-gray-100 pt-4 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">브랜드 로고</p>
          <LogoSelector/><LogoPositionSelector/>
        </div>

        {/* 이미지 */}
        <div ref={refImage} className="border-t border-gray-100 pt-4 space-y-2">
          <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5 text-gray-500"/>이미지</Label>
          <div {...getImageRP()} className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isImageDrag?"border-[#F43182] bg-[#F43182]/5":"border-gray-300 hover:border-gray-400"}`}>
            <input {...getImageIP()}/>
            {imagePreview?(<div className="space-y-2"><img src={imagePreview} alt="Preview" className="max-h-24 mx-auto rounded"/><p className="text-xs text-gray-500">클릭하여 교체 · 캔버스에서 위치·크기 조절</p></div>):(<div className="space-y-1"><ImageIcon className="w-8 h-8 mx-auto text-gray-400"/><p className="text-xs text-gray-600">이미지 드래그 또는 클릭하여 업로드</p><p className="text-xs text-gray-400">캔버스에서 위치·크기 조절 · 모서리 라운드 자동</p></div>)}
          </div>
          {imagePreview ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[12px]"
                onClick={() => {
                  onContentChange({
                    ...content,
                    image: undefined,
                    posterBackgroundImageRect: undefined,
                    posterImageOpacity: 0,
                  });
                  setImagePreview(null);
                }}
              >
                제거
              </Button>
            </div>
          ) : null}
          <div className="pt-1">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={content.posterImageOpacity ?? 0}
              onChange={(e) => onContentChange({ ...content, posterImageOpacity: Number(e.target.value) })}
              className="h-2 w-full cursor-pointer accent-[#F43182]"
            />
            <p className="text-xs text-gray-500">
              투명도 · <span className="font-mono tabular-nums">{content.posterImageOpacity ?? 100}%</span> (기본 100%)
            </p>
            <p className="mt-1 text-xs text-gray-400">팁: 캔버스에서 <span className="font-semibold">Alt</span>를 누른 채 드래그하면 이미지 내부 위치를 조정할 수 있습니다</p>
          </div>
        </div>

        <AssetSection/>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0"/>
            <div className="text-xs text-blue-900"><p className="font-medium mb-1">포스터 제작 가이드</p><ul className="space-y-1 text-blue-800"><li>• 카테고리 선택 시 샘플 텍스트가 자동 입력됩니다</li><li>• 에셋 업로드 후 캔버스에서 자유롭게 배치하세요</li><li>• 인쇄 시 300 DPI · CMYK 변환을 확인하세요</li></ul></div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── 기본 패널
  // ════════════════════════════════════════════════════════════════════
  return (
    <div data-design-content-panel className="h-full overflow-y-auto p-6 space-y-6">
      <AssetPresetPickerDialog
        open={pictoDialogOpen}
        onOpenChange={setPictoDialogOpen}
        title="픽토그램 선택"
        presets={PICTOGRAM_PRESETS}
        filterPresets={filterAssetPresets}
        layout="picto"
        onPick={(p) => {
          const layer = createAssetLayer(p.src, "pictogram", p.name);
          onContentChange({ ...content, assetLayers: [...assetLayers, layer] });
          setPictoDialogOpen(false);
        }}
        onDropFiles={(files) => onAssetDrop(files, "pictogram")}
      />
      <div><h2 className="font-semibold text-gray-900 mb-1">Content & Style</h2><p className="text-sm text-gray-500">Input your content and select a design style</p></div>
      {isContentEmpty&&onShowQuickStart&&(
        <Button onClick={onShowQuickStart} variant="outline" className="w-full border-dashed border-2 h-auto py-4">
          <div className="flex flex-col items-center gap-2"><Sparkles className="w-5 h-5 text-blue-600"/><div><p className="font-medium">Load Demo Content</p><p className="text-xs text-gray-500 font-normal">See the platform in action</p></div></div>
        </Button>
      )}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Design Style</Label>
        <RadioGroup value={content.style} onValueChange={(v)=>onContentChange({...content,style:v as DesignStyle})}>
          <div className="space-y-2">
            {[{value:"basic",title:"Basic",desc:"Text, Logo only"},{value:"informational",title:"Informational",desc:"Image, Text, Pictogram, Icon, Logo"},{value:"no-limit",title:"No Limit",desc:"All you want - 자유 배치"}].map((s)=>(
              <div key={s.value} className="flex items-start space-x-3 p-3 border rounded-lg hover:border-[#F43182] transition-colors cursor-pointer">
                <RadioGroupItem value={s.value} id={s.value} className="mt-1"/>
                <div className="flex-1"><Label htmlFor={s.value} className="cursor-pointer font-medium">{s.title}</Label><p className="text-xs text-gray-500 mt-1">{s.desc}</p></div>
              </div>
            ))}
          </div>
        </RadioGroup>
      </div>
      <div className="space-y-3">
        <Label className="text-sm font-medium">배경색</Label>
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
          {[{label:"White",hex:"#FFFFFF",border:"#E5E5E5"},{label:"Grey",hex:"#F5F5F5",border:"#D1D1D1"},{label:"Ivory",hex:"#FDFAF0",border:"#D9D5C0"},{label:"Pink",hex:"#FFF0F5",border:"#F4B8D0"},{label:"Magenta",hex:"#F43182",border:"#F43182"},{label:"Black",hex:"#000000",border:"#000000"}].map((color)=>{
            const active=(content.backgroundColor||"#FFFFFF")===color.hex;
            return (
              <button key={color.hex} type="button" title={color.label} onClick={()=>onContentChange({...content,backgroundColor:color.hex})}
                className={`shrink-0 flex flex-col items-center gap-0.5 rounded-md border-2 py-1 px-1.5 text-center transition-all ${active?"border-[#F43182] bg-[#F43182]/6":"border-gray-200 hover:border-gray-300 bg-white"}`}>
                <span className="h-6 w-6 shrink-0 rounded-sm" style={{background:color.hex,border:`1px solid ${color.border}`}}/>
                <span className={`max-w-[3.25rem] truncate text-[8px] font-medium leading-tight ${active?"text-[#F43182]":"text-gray-600"}`}>{color.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-3 border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Title *</Label>
          <Button variant="ghost" size="sm" onClick={()=>setShowTitleOptions(!showTitleOptions)} className="h-7 px-2">
            <Settings className="w-3.5 h-3.5 mr-1"/>{showTitleOptions?<ChevronUp className="w-3.5 h-3.5"/>:<ChevronDown className="w-3.5 h-3.5"/>}
          </Button>
        </div>
        <Textarea value={content.title} onChange={(e)=>onContentChange({...content,title:e.target.value})} placeholder="Enter your main headline" rows={3} className="font-medium resize-none"/>
        {showTitleOptions&&(
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <Label className="text-xs font-medium text-gray-700 mb-2 block">텍스트 색상</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {["#000000","#FFFFFF","#F43182","#6B7280","#3B82F6","#EF4444"].map((color)=>(
                <button key={color} onClick={()=>onContentChange({...content,titleColor:color})}
                  className={`w-full h-8 rounded border-2 ${(content.titleColor||"#000000")===color?"border-[#F43182] scale-110":"border-gray-300"} transition-all`}
                  style={{backgroundColor:color}}/>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500">{content.title.length} characters</p>
      </div>
      <div className="space-y-3"><Label className="text-sm font-medium">Subtitle</Label><Textarea value={content.subtitle} onChange={(e)=>onContentChange({...content,subtitle:e.target.value})} placeholder="Add a supporting subtitle" rows={2} className="resize-none"/></div>
      <div className="space-y-3"><Label className="text-sm font-medium">Body Text</Label><Textarea value={content.bodyText} onChange={(e)=>onContentChange({...content,bodyText:e.target.value})} placeholder="Add detailed information or key points" rows={5} className="resize-none"/></div>
      <div className="border-t border-gray-200 pt-6 space-y-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#F43182]"/>Brand Assets</h3>
        <LogoSelector/><LogoPositionSelector/>
      </div>
      <div className="space-y-2">
        <Label>Main Image</Label>
        <div {...getImageRP()} className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${content.style==="basic"?"border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed pointer-events-none":isImageDrag?"border-blue-500 bg-blue-50":"border-gray-300 hover:border-gray-400"}`}>
          <input {...getImageIP()} disabled={content.style==="basic"}/>
          {imagePreview&&content.style!=="basic"?(<div className="space-y-3"><img src={imagePreview} alt="Preview" className="max-h-32 mx-auto rounded"/><p className="text-sm text-gray-600">Click or drag to replace</p></div>):(<div className="space-y-3"><ImageIcon className="w-10 h-10 mx-auto text-gray-400"/><p className="text-sm font-medium text-gray-700">{content.style==="basic"?"이미지 업로드 불가 (Basic 스타일)":"Drop an image here, or click to browse"}</p></div>)}
        </div>
      </div>
      <AssetSection/>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2"><Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0"/><div className="text-xs text-blue-900"><p className="font-medium mb-1">Pro Tips:</p><ul className="space-y-1 text-blue-800"><li>• Keep titles concise for maximum impact</li><li>• Use high-resolution images for print formats</li><li>• Text auto-resizes to fit your canvas</li></ul></div></div>
      </div>
    </div>
  );
}
