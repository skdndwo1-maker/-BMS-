import { useState, useCallback, useEffect, useRef, type SetStateAction } from "react";
import { useDropzone } from "react-dropzone";
import type { DesignContent, DesignStyle, LogoPosition, PosterCategory, AssetLayer, AssetType } from "@/design/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Upload, Image as ImageIcon, Sparkles, Type,
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
import { ILLUSTRATION_PRESETS, PICTOGRAM_PRESETS, filterAssetPresets } from "@/design/assetPresets";
import { AssetPresetPickerDialog } from "@/components/design/AssetPresetPickerDialog";
import { resolveRcsMessageBackground } from "@/components/design/RCSCanvas";
import { templates as allDesignTemplates } from "@/design/templates";
import { resolvePosterBodyBlocksForRender, applyBodyBlockTextEdit } from "@/design/posterBodyDisplay";
import { VI_COLORS } from "@/design/viCanvasConstants";

interface ContentPanelProps {
  content: DesignContent;
  onContentChange: (next: SetStateAction<DesignContent>) => void;
  onShowQuickStart?: () => void;
  templateId?: string;
  focusTarget?: import("./DesignCanvas").DesignFocusTarget;
}

/** 현수막·X배너 등 — 우측 패널 배경·날짜·장소 필드 표시 */
const PLACARD_IDS = [
  "placard-wide-landscape",
  "placard-1000x600",
  "placard-2000x1000",
  "placard-600x1800",
  "placard-vertical",
];

function PosterBodyTextarea({
  value,
  onChange,
  boldRanges,
  rows = 5,
}: {
  value: string;
  /** 텍스트 + 조정된 굵게 범위를 한 번에 반영해야 함(연속 setState 시 stale content로 덮어쓰기 방지) */
  onChange: (v: string, nextBoldRanges: Array<{ start: number; end: number }>) => void;
  boldRanges?: Array<{ start: number; end: number }>;
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
          onChange(newPlain, nextRanges);
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
  { key: "notice", label: "공지사항", emoji: "📢", color: "#3B82F6", preset: { backgroundColor: "#FFFFFF", titleColor: "#1A1A1A", subtitle: "안내", title: "브랜드 공지사항.", bodyText: "서비스 점검 및 일정 안내\n자세한 내용은 홈페이지를 참고하세요", emphasizedTitle: "※ 일정은 사정에 따라 변경될 수 있습니다." } },
  { key: "new-product", label: "신제품 출시", emoji: "📱", color: "#1A1A1A", preset: { backgroundColor: "#000000", titleColor: "#FFFFFF", subtitle: "신제품 출시", title: "새로운 시작.", bodyText: "최신 단말 출시\n단독 특가\n사전예약 진행 중", emphasizedTitle: "※ 실제 제품 색상은 화면과 다를 수 있습니다." } },
  { key: "promotion", label: "프로모션", emoji: "🎁", color: "#FF7F66", preset: { backgroundColor: "#FF7F66", titleColor: "#FFFFFF", subtitle: "특별 혜택", title: "특별 혜택을 드립니다.", bodyText: "가입 즉시 혜택 제공\n최대 할인\n사은품 증정", emphasizedTitle: "※ 본 프로모션은 기간 한정으로 조기 종료될 수 있습니다." } },
  { key: "plan-benefit", label: "요금&혜택", emoji: "💰", color: "#8B5CF6", preset: { backgroundColor: "#FFF0F5", titleColor: "#1A1A1A", subtitle: "요금 안내", title: "합리적인 요금제.", bodyText: "월 요금부터\n데이터 혜택\n가족 결합 할인", emphasizedTitle: "※ 부가세 포함 금액이며 약정 조건에 따라 상이합니다." } },
];

const rcsTemplates = {
  요금제: {
    가입안내: "요금제 가입 환영해요",
    해지안내: "아쉽지만 또 만나요",
    "서비스 종료안내": "요금제 이용이 곧 종료됩니다",
    혜택안내: "함께하면 더 특별한 요금제 혜택",
  },
  모바일서비스: {
    가입안내: "모바일 서비스 가입을 환영해요",
    해지안내: "다음에 또 만나요",
    "서비스 종료안내": "모바일 서비스 이용이 곧 종료됩니다",
    혜택안내: "유플러스 사전예약 혜택 5.14(화)~5.20(화)",
  },
  결합: {
    가입안내: "이제 함께 할인받을 수 있어요",
    해지안내: "아쉽지만 또 만나요",
    "서비스 종료안내": "결합 이용이 곧 종료됩니다",
    혜택안내: "가족과 함께하면 네이버페이 100% 증정!",
  },
  요금할인: {
    가입안내: "요금부담을 덜었어요",
    해지안내: "아쉽지만 또 만나요",
    "서비스 종료안내": "요금할인 이용이 곧 종료됩니다",
    혜택안내: "쓰던 폰 그대로, 가족 모두 할인",
  },
  로밍: {
    가입안내: "로밍 가입을 환영해요",
    해지안내: "안전한 귀국길 되셨나요?",
    "서비스 종료안내": "로밍 이용이 곧 종료됩니다",
    혜택안내: "밝은 여행길을 위해, 데이터 2배 증정 혜택",
  },
} as const;

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
  const [illustDialogOpen, setIllustDialogOpen] = useState(false);

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

  /** 캔버스 등에서 배경 이미지 제거 시 로컬 미리보기와 동기화 */
  useEffect(() => {
    if (content.image == null) setImagePreview(null);
  }, [content.image]);

  useEffect(() => {
    if (content.logo == null) {
      setLogoPreview(null);
      return;
    }
    if (typeof content.logo === "string") setLogoPreview(content.logo);
  }, [content.logo]);

  /** posterBodies.body-1 텍스트가 비어 있는데 bodyText만 남아 있으면(레거시 불일치) 본문 입력란이 비어 보이는 문제 방지 */
  useEffect(() => {
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
  }, [content, onContentChange]);

  const isPlacard = PLACARD_IDS.includes(templateId ?? "");
  /** 템플릿 갤러리에 등록된 모든 온·오프라인 템플릿: A1 포스터와 동일 편집 패널 */
  const useBrandGraphicPanel = allDesignTemplates.some((t) => t.id === templateId);
  const isContentEmpty = !content.title && !content.subtitle && !content.bodyText;
  const templateMeta = allDesignTemplates.find((t) => t.id === templateId);
  const isXBanner = (templateId ?? "") === "xbanner" || templateMeta?.category === "xbanner";
  const isRcs = templateMeta?.category === "rcs";
  const assetLayers   = content.assetLayers ?? [];

  // RCS 20종 문구 선택 UI (우측 패널 전용)
  const [rcsProduct, setRcsProduct] = useState<keyof typeof rcsTemplates | null>(null);
  const [rcsMessageType, setRcsMessageType] = useState<keyof (typeof rcsTemplates)["요금제"] | null>(null);
  const rcsCanApply = Boolean(rcsProduct && rcsMessageType);
  const rcsNextTitle = rcsCanApply ? rcsTemplates[rcsProduct!][rcsMessageType!] : "";
  const rcsTypeForPanel =
    rcsMessageType ?? (content as DesignContent & { rcsMessageType?: string | null }).rcsMessageType ?? null;

  const setRcsMessageTypeOnContent = (t: keyof (typeof rcsTemplates)["요금제"] | null) => {
    onContentChange((prev) => ({
      ...prev,
      rcsMessageType: t,
      backgroundColor: resolveRcsMessageBackground(t),
    }));
  };

  const onAssetDrop = useCallback((files: File[], type: AssetType) => {
    const newAssets = files.map(f => createAssetLayer(URL.createObjectURL(f), type, f.name));
    onContentChange({ ...content, assetLayers: [...assetLayers, ...newAssets] });
  }, [content, assetLayers, onContentChange]);

  const applyRcsTitle = (nextTitle: string) => {
    const t = (nextTitle ?? "").trim();
    if (!t.length) return;
    onContentChange((prev) => ({ ...prev, title: t }));
  };

  const { getRootProps:getImageRP,  getInputProps:getImageIP,  isDragActive:isImageDrag  } = useDropzone({ onDrop:(f)=>{ if(f[0]){
    onContentChange({
      ...content,
      image:f[0],
      posterBackgroundImageRect: content.posterBackgroundImageRect ?? DEFAULT_POSTER_BG_RECT,
      posterImageOpacity: 100,
      posterImagePosX: 50,
      posterImagePosY: 50,
    });
    setImagePreview(URL.createObjectURL(f[0]));
  }}, accept:{"image/*":[".png",".jpg",".jpeg",".webp"]}, multiple:false });
  /**
   * 로고 업로드: react-dropzone 대신 ref 기반 hidden input을 쓴다.
   * `LogoSelector`가 ContentPanel 안에서 매 렌더마다 재생성되며 remount되기 때문에
   * dropzone 내부 input ref가 분리되어 onDrop이 누락되는 케이스를 피하기 위함.
   */
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const openLogoPicker = useCallback(() => {
    logoInputRef.current?.click();
  }, []);
  const handleLogoFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      onContentChange({ ...content, logo: file });
      setLogoPreview(URL.createObjectURL(file));
      e.target.value = "";
    },
    [content, onContentChange]
  );

  const clearUploadedLogo = () => {
    onContentChange({ ...content, logo: undefined, customUploadedLogoRect: undefined });
    setLogoPreview(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

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
        <Tooltip>
          <TooltipTrigger asChild>
            <Label className="text-sm font-semibold text-gray-700 cursor-help">로고 종류 선택</Label>
          </TooltipTrigger>
          <TooltipContent>CI / BI / SLOGAN 중 선택</TooltipContent>
        </Tooltip>
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
                active ? "border-[#FF7F66] bg-[#FF7F66]/6" : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <p className={`text-sm font-bold leading-tight ${active ? "text-[#FF7F66]" : "text-gray-800"}`}>{opt.label}</p>
              <p className="mt-1 text-[9px] text-gray-400 leading-tight">{opt.desc}</p>
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        <p className="text-[11px] text-gray-500">직접 업로드한 로고는 위 CI/BI/SLOGAN 프리셋과 함께 표시되며, 캔버스에서 자유롭게 위치·크기 조절 및 삭제가 가능합니다.</p>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 border-gray-300"
          onClick={openLogoPicker}
        >
          <Upload className="w-4 h-4" />
          로고 이미지 불러오기
        </Button>
        {content.logo && logoPreview ? (
          <div className="flex items-center justify-center gap-3 rounded-lg border border-gray-200 bg-gray-50/50 p-2">
            <img src={logoPreview} alt="선택한 로고" className="max-h-10 object-contain" />
            <p className="text-[11px] text-gray-500">캔버스에서 끌어 위치·크기를 조정하세요</p>
          </div>
        ) : null}
        {content.logo ? (
          <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 text-gray-600" onClick={clearUploadedLogo}>
            <Trash2 className="w-3.5 h-3.5" />
            업로드 로고 제거
          </Button>
        ) : null}
      </div>
    </div>
  );

  const LogoPositionSelector = () => (
    <div className="space-y-3">
      <Label className="text-sm font-semibold text-gray-700">로고 배치 위치</Label>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        CI/BI/SLOGAN 프리셋 로고의 코너 위치입니다. 직접 업로드한 로고는 캔버스에서 자유롭게 끌어 옮기고 크기를 바꿀 수 있습니다.
      </p>
      <div
        className={
          isXBanner
            ? "grid w-full grid-cols-3 gap-2 [grid-template-columns:repeat(3,minmax(0,1fr))]"
            : `grid w-full grid-cols-2 gap-2 ${isPlacard ? "" : "sm:grid-cols-4"}`
        }
        style={
          isXBanner
            ? { gridAutoFlow: "row", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }
            : undefined
        }
      >
        {(isPlacard
          ? [
              { key: "top-left" as LogoPosition, label: "좌상단", icon: CornerUpLeft },
              { key: "bottom-left" as LogoPosition, label: "좌하단", icon: CornerDownLeft },
            ]
          : isXBanner
            ? [
                { key: "top-left" as LogoPosition, label: "좌상단", icon: CornerUpLeft },
                { key: "top-center" as LogoPosition, label: "상단중앙", icon: CornerUpLeft },
                { key: "top-right" as LogoPosition, label: "우상단", icon: CornerUpRight },
                { key: "bottom-left" as LogoPosition, label: "좌하단", icon: CornerDownLeft },
                { key: "bottom-center" as LogoPosition, label: "하단중앙", icon: CornerDownLeft },
                { key: "bottom-right" as LogoPosition, label: "우하단", icon: CornerDownRight },
              ]
            : [
                { key: "top-left" as LogoPosition, label: "좌상단", icon: CornerUpLeft },
                { key: "top-right" as LogoPosition, label: "우상단", icon: CornerUpRight },
                { key: "bottom-left" as LogoPosition, label: "좌하단", icon: CornerDownLeft },
                { key: "bottom-right" as LogoPosition, label: "우하단", icon: CornerDownRight },
              ]
        ).map((pos) => {
          const Icon=pos.icon; const active=content.logoPosition===pos.key;
          return (
            <button key={pos.key} onClick={()=>onContentChange({...content,logoPosition:pos.key})}
              className={`min-w-0 flex flex-col items-center gap-1.5 rounded-lg border-2 py-3 px-2 text-center transition-all ${active?"border-[#FF7F66] bg-[#FF7F66]/6":"border-gray-200 hover:border-gray-300 bg-white"}`}>
              <Icon className={`w-4 h-4 ${active?"text-[#FF7F66]":"text-gray-600"}`}/>
              <p className={`text-xs font-medium ${active?"text-[#FF7F66]":"text-gray-700"}`}>{pos.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const AssetSection = () => (
    <div className="border-t border-gray-100 pt-4 space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">에셋</p>
      <p className="text-xs text-gray-400">업로드 후 캔버스 위에서 자유롭게 이동 · 리사이즈 가능</p>

      {/* 일러스트 */}
      <div className="space-y-1.5">
        <div className="flex items-end justify-between gap-2">
          <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
            <Shapes className="w-3.5 h-3.5" />
            일러스트
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-[12px]"
            onClick={() => setIllustDialogOpen(true)}
          >
            일러스트 선택
          </Button>
        </div>
        <p className="text-xs text-gray-400">버튼을 눌러 팝업에서 검색·선택하세요</p>
      </div>

      {/* 픽토그램 (RCS에서는 옵션 제거) */}
      {!isRcs ? (
        <div className="space-y-1.5">
          <div className="flex items-end justify-between gap-2">
            <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Shapes className="w-3.5 h-3.5"/>픽토그램</Label>
            <Button type="button" variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setPictoDialogOpen(true)}>
              픽토그램 선택
            </Button>
          </div>
          <p className="text-xs text-gray-400">버튼을 눌러 팝업에서 검색·선택하세요</p>
        </div>
      ) : null}

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
  // ── 브랜드 디자인 패널 (갤러리의 모든 온·오프라인 템플릿 — A1과 동일 기능)
  // ════════════════════════════════════════════════════════════════════
  if (useBrandGraphicPanel) {
    const currentCat=POSTER_CATEGORIES.find(c=>c.key===normalizePosterCategory(content.posterCategory))??POSTER_CATEGORIES[0];
    return (
      <div data-design-content-panel className="h-full overflow-y-auto p-6 space-y-6">
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={handleLogoFileChange}
        />
        <AssetPresetPickerDialog
          open={illustDialogOpen}
          onOpenChange={setIllustDialogOpen}
          title="일러스트 선택"
          presets={ILLUSTRATION_PRESETS}
          filterPresets={filterAssetPresets}
          layout="picto"
          onPick={(p) => {
            const layer = createAssetLayer(p.src, "illustration", p.name);
            onContentChange({ ...content, assetLayers: [...assetLayers, layer] });
            setIllustDialogOpen(false);
          }}
          onDropFiles={(files) => onAssetDrop(files, "illustration")}
        />
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
          <h2 className="font-semibold text-gray-900 mb-1">브랜드 디자인 콘텐츠</h2>
          <div className="flex flex-col gap-1 mt-1">
            <p className="text-sm text-gray-500">
              {templateMeta
                ? `${templateMeta.name} · ${templateMeta.size.width}×${templateMeta.size.height} ${templateMeta.size.unit}`
                : "브랜드 가이드 기반 서식"}
            </p>
            <span className="inline-flex items-center gap-1 bg-[#FF7F66]/10 border border-[#FF7F66]/25 rounded-full px-2 py-0.5 w-fit">
              <Sparkles className="w-3 h-3 text-[#FF7F66]"/><span className="text-[10px] font-medium text-[#FF7F66]">Brand Guideline</span>
            </span>
          </div>
          {/* 설명 문구는 각 기능 타이틀 툴팁으로 이동 */}
        </div>

        {isPlacard && templateMeta && (
          <div className="space-y-3 border border-[#FF7F66]/20 rounded-xl p-4 bg-[#FF7F66]/5">
            <div className="bg-white/80 border border-[#FF7F66]/25 rounded-lg p-3 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-[#FF7F66] mt-0.5 shrink-0" />
              <div className="text-xs text-gray-700">
                <p className="font-medium text-[#FF7F66] mb-0.5">현수막 / 배널 규격</p>
                <p>
                  {templateMeta.size.width}×{templateMeta.size.height}
                  {templateMeta.size.unit} · VI 12분할은 짧은 변 기준입니다. 날짜·장소·분할 배경은 콘텐츠 필드로 유지됩니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 카테고리 */}
        {isRcs ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-gray-700">템플릿 카테고리</Label>
              <span className="text-[10px] font-medium text-[#FF7F66] bg-[#FF7F66]/10 border border-[#FF7F66]/20 rounded-full px-2 py-0.5">
                RCS 전용
              </span>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-700">상품 선택</p>
                <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
                  {(["요금제", "모바일서비스", "결합", "요금할인", "로밍"] as const).map((k) => {
                    const active = rcsProduct === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setRcsProduct(k);
                          if (rcsMessageType) applyRcsTitle(rcsTemplates[k][rcsMessageType]);
                        }}
                        className={`shrink-0 inline-flex items-center justify-center whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
                          active
                            ? "border-[#FF7F66] bg-[#FF7F66]/10 text-[#FF7F66]"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        {k}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-700">메시지 유형</p>
                <div className="grid grid-cols-1 gap-2 min-w-0">
                  {(["가입안내", "해지안내", "서비스 종료안내", "혜택안내"] as const).map((k) => {
                    const active = rcsMessageType === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setRcsMessageType(k);
                          setRcsMessageTypeOnContent(k);
                          if (rcsProduct) applyRcsTitle(rcsTemplates[rcsProduct][k]);
                        }}
                        className={`w-full min-w-0 rounded-xl border-2 p-2.5 text-left transition-all ${
                          active ? "border-[#FF7F66] bg-[#FF7F66]/6" : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div className={`text-[12px] font-semibold ${active ? "text-[#FF7F66]" : "text-gray-800"}`}>
                          {k}
                        </div>
                        <div className="mt-0.5 text-[10px] text-gray-400 break-words whitespace-normal">
                          {rcsProduct ? rcsTemplates[rcsProduct][k] : "상품을 먼저 선택하세요"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-[12px]"
                  onClick={() => {
                    setRcsProduct(null);
                    setRcsMessageType(null);
                    setRcsMessageTypeOnContent(null);
                  }}
                >
                  선택 초기화
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 flex-1 text-[12px]"
                  disabled={!rcsCanApply}
                  onClick={() => applyRcsTitle(rcsNextTitle)}
                >
                  적용
                </Button>
              </div>
            </div>

          </div>
        ) : (
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
        )}

        {/* 현수막(placard): 분할영역 배경 옵션을 템플릿 카테고리 바로 아래로 이동 */}
        {isPlacard ? (
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <Label className="text-sm font-semibold text-gray-700">분할 영역 배경(우측 패널 톤)</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { key: "white" as const, label: "백지", hex: "#FFFFFF", border: "#D4D4D4" },
                  { key: "light-grey" as const, label: "라이트 그레이", hex: "#F2F2F2", border: "#D4D4D4" },
                  { key: "ivory" as const, label: "아이보리", hex: "#FDFAF0", border: "#D9D5C0" },
                  { key: "light-pink" as const, label: "연핑크", hex: "#FFF0F5", border: "#F4B8D0" },
                ] as const
              ).map((opt) => {
                const active = (content.rightPanelBg ?? "white") === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => onContentChange({ ...content, rightPanelBg: opt.key })}
                    className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                      active ? "border-[#FF7F66] shadow-sm" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span
                      className="shrink-0 rounded-md"
                      style={{
                        width: 22,
                        height: 22,
                        background: opt.hex,
                        border: `1.5px solid ${opt.border}`,
                        display: "inline-block",
                      }}
                    />
                    <span className={`text-xs font-medium ${active ? "text-[#FF7F66]" : "text-gray-700"}`}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* 배경색 (RCS: 메시지 유형으로 고정 · 기타: 팔레트 + 커스텀) */}
        {!isPlacard ? (
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <Label className="text-sm font-semibold text-gray-700">배경색</Label>
            {isRcs ? (
              <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  메시지 유형에 따라 자동 적용됩니다. 가입안내: Pink · 혜택안내: Light Purple · 해지안내/서비스
                  종료안내: Ivory
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className="h-8 w-10 rounded-md border border-gray-200 shrink-0"
                    style={{ background: resolveRcsMessageBackground(rcsTypeForPanel) }}
                  />
                  <div className="min-w-0 text-[11px] text-gray-700">
                    <p className="font-mono tabular-nums">{resolveRcsMessageBackground(rcsTypeForPanel)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">유형을 선택하지 않은 경우 기본(Pink)입니다.</p>
                  </div>
                </div>
              </div>
            ) : (
            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
              {(
                [
                  { label: "White", hex: "#FFFFFF", border: "#E5E5E5" },
                  { label: "Grey", hex: "#F5F5F5", border: "#D1D1D1" },
                  { label: "Ivory", hex: "#FDFAF0", border: "#D9D5C0" },
                  { label: "Pink", hex: "#FFF0F5", border: "#F4B8D0" },
                  { label: "Magenta", hex: VI_COLORS.brandMagenta, border: VI_COLORS.brandMagenta },
                  { label: "Black", hex: "#000000", border: "#000000" },
                ] as const
              ).map((color) => {
                const active = (content.backgroundColor || "#FFFFFF") === color.hex;
                return (
                  <button
                    key={color.hex}
                    type="button"
                    title={color.label}
                    onClick={() => onContentChange({ ...content, backgroundColor: color.hex })}
                    className={`shrink-0 flex flex-col items-center gap-0.5 rounded-md border-2 py-1 px-1.5 text-center transition-all ${
                      active
                        ? "border-[#FF7F66] bg-[#FF7F66]/6"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <span
                      className="h-6 w-6 shrink-0 rounded-sm"
                      style={{ background: color.hex, border: `1px solid ${color.border}` }}
                    />
                    <span
                      className={`max-w-[4.25rem] truncate text-[8px] font-medium leading-tight ${
                        active ? "text-[#FF7F66]" : "text-gray-600"
                      }`}
                    >
                      {color.label}
                    </span>
                  </button>
                );
              })}
            </div>
            )}

            {!isRcs ? (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={content.backgroundColor || "#FFFFFF"}
                  onChange={(e) => onContentChange({ ...content, backgroundColor: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                />
                <div className="flex-1 flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-400 font-mono">#</span>
                  <input
                    type="text"
                    value={(content.backgroundColor || "#FFFFFF").replace("#", "")}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                      if (v.length === 6) onContentChange({ ...content, backgroundColor: `#${v}` });
                    }}
                    placeholder="F43182"
                    className="flex-1 text-sm font-mono outline-none bg-transparent"
                    maxLength={6}
                  />
                </div>
                <div
                  className="w-10 h-10 rounded-lg border border-gray-300 shrink-0"
                  style={{ background: content.backgroundColor || "#FFFFFF" }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 뱃지 (RCS/현수막 제외: 최대 3개) */}
        {!isPlacard && !isRcs ? (
          <div ref={refBadge} className="space-y-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <span className="inline-block text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: VI_COLORS.brandMagenta }}>뱃지</span>
                뱃지 텍스트
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[12px] shrink-0"
                disabled={((content.posterBadges?.length ?? 0) >= 3) && !content.posterBadgeRect}
                onClick={() => {
                  const existing = content.posterBadges?.length
                    ? content.posterBadges
                    : content.subtitle?.trim() && content.posterBadgeRect
                      ? [{ id: "badge-1", text: content.subtitle, color: content.posterBadgeColor ?? "magenta" } as const]
                      : [];
                  if (existing.length >= 3) return;
                  const id = `badge-${Date.now()}`;
                  const rects = { ...(content.posterBadgeRects ?? {}) };
                  rects[id] = rects[id] ?? { ...DEFAULT_POSTER_BADGE_RECT, y: Math.min(0.92, DEFAULT_POSTER_BADGE_RECT.y + existing.length * 0.07) };
                  onContentChange({
                    ...content,
                    // 레거시 단일 뱃지 필드 정리
                    subtitle: "",
                    posterBadgeRect: undefined,
                    posterBadgeColor: undefined,
                    posterBadges: [...existing, { id, text: "", color: "magenta" }],
                    posterBadgeRects: rects,
                  });
                }}
              >
                +추가
              </Button>
            </div>

            {(() => {
              const badges =
                content.posterBadges?.length
                  ? content.posterBadges
                  : content.subtitle?.trim() && content.posterBadgeRect
                    ? [{ id: "badge-1", text: content.subtitle, color: content.posterBadgeColor ?? "magenta" } as const]
                    : [];
              if (badges.length === 0) {
                return <p className="text-xs text-gray-400">오른쪽의 +추가로 뱃지를 최대 3개까지 만들 수 있습니다.</p>;
              }
              return (
                <div className="space-y-3">
                  {badges.slice(0, 3).map((b, idx) => (
                    <div key={b.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-600">뱃지 {idx + 1}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            const next = badges.filter((x) => x.id !== b.id);
                            const rects = { ...(content.posterBadgeRects ?? {}) };
                            delete rects[b.id];
                            onContentChange({
                              ...content,
                              posterBadges: next,
                              posterBadgeRects: rects,
                            });
                          }}
                        >
                          제거
                        </Button>
                      </div>
                      <Input
                        value={b.text}
                        onChange={(e) => {
                          const v = e.target.value;
                          onContentChange({
                            ...content,
                            posterBadges: badges.map((x) => (x.id === b.id ? { ...x, text: v } : x)),
                          });
                        }}
                        placeholder="예) 2025 신제품 출시"
                      />
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { key: "magenta" as const, label: "마젠타", bg: VI_COLORS.brandMagenta },
                            { key: "black" as const, label: "블랙", bg: "#000000" },
                          ] as const
                        ).map((opt) => {
                          const active = (b.color ?? "magenta") === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() =>
                                onContentChange({
                                  ...content,
                                  posterBadges: badges.map((x) => (x.id === b.id ? { ...x, color: opt.key } : x)),
                                })
                              }
                              className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-left text-xs font-medium transition-all ${
                                active ? "border-[#FF7F66] bg-[#FF7F66]/6" : "border-gray-200 hover:border-gray-300 bg-white"
                              }`}
                            >
                              <span className="h-5 w-5 rounded-md border border-gray-200" style={{ background: opt.bg }} />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400">캔버스에서 각 뱃지의 크기·위치를 드래그해 조절할 수 있습니다.</p>
                </div>
              );
            })()}
          </div>
        ) : null}

        {/* 메인 타이틀 · 부제 */}
        <div ref={refTitle} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-gray-500" />
              메인 타이틀
            </Label>
            {!isRcs ? (
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
            ) : null}
          </div>
          {/* 기능부연설명(점선 박스) 제거 */}
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
          {isRcs ? (
            <div className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/70 p-3">
              <Label className="text-xs font-semibold text-gray-600">강조</Label>
              <Input
                value={content.emphasizedTitle || ""}
                onChange={(e) => onContentChange({ ...content, emphasizedTitle: e.target.value })}
                placeholder="메인 타이틀 중 강조할 단어/구문"
              />
              <p className="text-[10px] text-gray-400">
                입력한 문자열이 메인 타이틀 안에 포함되면 해당 부분이 마젠타로 강조됩니다.
              </p>
            </div>
          ) : null}
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
                    posterSubtitleRectLocked: {
                      ...(content.posterSubtitleRectLocked ?? {}),
                      [s.id]: false,
                    },
                  });
                }}
                placeholder="부제 텍스트"
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          ))}
          {/* 기능부연설명(점선 박스) 제거 */}
        </div>

        {/* 본문 (최대 3블록) */}
        <div ref={refBody} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5 text-gray-500" />
              본문
            </Label>
            {!isRcs ? (
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
            ) : null}
          </div>
          {/* 기능부연설명(점선 박스) 제거 */}
          {resolvePosterBodyBlocksForRender(content).map((b, bi) => (
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
                onChange={(v, ranges) =>
                  onContentChange((prev) => {
                    const next = applyBodyBlockTextEdit(prev, b.id, v);
                    return {
                      ...next,
                      posterBodyBoldRanges: {
                        ...(next.posterBodyBoldRanges ?? {}),
                        [b.id]: ranges,
                      },
                    };
                  })
                }
              />
            </div>
          ))}
          {/* 기능부연설명(점선 박스) 제거 */}
        </div>

        {/* 유의사항 (RCS에서는 제거) */}
        {!isRcs ? (
          <div ref={refFooter} className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">하단 유의사항</Label>
            {/* 기능부연설명(점선 박스) 제거 */}
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
            {/* 기능부연설명(점선 박스) 제거 */}
          </div>
        ) : null}

        {/* 현수막(placard): 장소 및 날짜 */}
        {isPlacard ? (
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">장소 및 날짜</Label>
            <Input
              value={content.placardEventInfo ?? ""}
              onChange={(e) => onContentChange({ ...content, placardEventInfo: e.target.value })}
              placeholder="예) 2026.00.00 ㅣ 엘지유플러스 상암사옥 1층"
            />
            <p className="text-xs text-gray-400">캔버스 좌하단에 유의사항과 동일한 크기로 표시됩니다</p>
          </div>
        ) : null}

        {/* 로고 (RCS에서는 제거) */}
        {!isRcs ? (
          <div ref={refLogo} className="border-t border-gray-100 pt-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">브랜드 로고</p>
            <LogoSelector/>
            {!isPlacard ? <LogoPositionSelector/> : null}
          </div>
        ) : null}

        {/* 이미지 (RCS: 업로드 옵션 제거) */}
        {!isRcs ? (
        <div ref={refImage} className="border-t border-gray-100 pt-4 space-y-2">
          <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5 text-gray-500"/>이미지</Label>
          <div {...getImageRP()} className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isImageDrag?"border-[#FF7F66] bg-[#FF7F66]/5":"border-gray-300 hover:border-gray-400"}`}>
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
                    posterImagePosX: undefined,
                    posterImagePosY: undefined,
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
              value={content.image != null ? (content.posterImageOpacity ?? 100) : (content.posterImageOpacity ?? 0)}
              onChange={(e) => onContentChange({ ...content, posterImageOpacity: Number(e.target.value) })}
              className="h-2 w-full cursor-pointer accent-[#FF7F66]"
            />
            <p className="text-xs text-gray-500">
              투명도 · <span className="font-mono tabular-nums">{content.posterImageOpacity ?? 100}%</span> (기본 100%)
            </p>
          </div>
          {content.image ? (
            <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <p className="text-xs font-semibold text-gray-700">박스 안 이미지 위치</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-full text-[12px]"
                onClick={() =>
                  onContentChange({ ...content, posterImagePosX: 50, posterImagePosY: 50 })
                }
              >
                위치 초기화 (중앙)
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-gray-400">
            캔버스에서 이미지 박스를 <span className="font-semibold">더블클릭</span>한 뒤 드래그하면 안쪽 이미지 위치를 조절할 수 있습니다. 빈 캔버스 클릭 또는 Esc로 종료합니다.
          </p>
        </div>
        ) : null}

        {/* 모든 템플릿: 이미지 옵션 아래 배경 라운드 박스 (RCS에서는 제거) */}
        {!isRcs ? (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                라운드 배경 박스
                <span
                  aria-hidden
                  className="inline-block h-3.5 w-5 rounded-md border border-gray-300 bg-white"
                />
              </Label>
              {content.panelBgOnCanvas ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px] shrink-0"
                  onClick={() => onContentChange({ ...content, panelBgOnCanvas: false })}
                >
                  제거
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px] shrink-0"
                  onClick={() =>
                    onContentChange({
                      ...content,
                      panelBgOnCanvas: true,
                      panelBgRect: content.panelBgRect ?? { x: 0.18, y: 0.08, width: 0.70, height: 0.84 },
                      rightPanelBg: (content.rightPanelBg ?? "white"),
                    })
                  }
                >
                  +추가
                </Button>
              )}
            </div>
            {content.panelBgOnCanvas ? (
              <>
                <p className="text-xs text-gray-400">
                  추가 후 캔버스에서 선택해 드래그·리사이즈로 조절할 수 있습니다. (항상 맨 뒤)
                </p>
                <Label className="text-xs font-semibold text-gray-600">색상</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: "white" as const, label: "백지", hex: "#FFFFFF", border: "#D4D4D4" },
                      { key: "light-grey" as const, label: "라이트 그레이", hex: "#F2F2F2", border: "#D4D4D4" },
                      { key: "ivory" as const, label: "아이보리", hex: "#FDFAF0", border: "#D9D5C0" },
                      { key: "light-pink" as const, label: "연핑크", hex: "#FFF0F5", border: "#F4B8D0" },
                    ] as const
                  ).map((opt) => {
                    const active = (content.rightPanelBg ?? "white") === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => onContentChange({ ...content, rightPanelBg: opt.key })}
                        className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                          active ? "border-[#FF7F66] shadow-sm" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <span
                          className="shrink-0 rounded-md"
                          style={{
                            width: 22,
                            height: 22,
                            background: opt.hex,
                            border: `1.5px solid ${opt.border}`,
                            display: "inline-block",
                          }}
                        />
                        <span className={`text-xs font-medium ${active ? "text-[#FF7F66]" : "text-gray-700"}`}>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400">+추가를 눌러 캔버스에 라운드 박스를 생성하세요.</p>
            )}
          </div>
        ) : null}

        <AssetSection/>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── 기본 패널
  // ════════════════════════════════════════════════════════════════════
  return (
    <TooltipProvider>
      <div data-design-content-panel className="h-full overflow-y-auto p-6 space-y-6">
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleLogoFileChange}
      />
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
              <div key={s.value} className="flex items-start space-x-3 p-3 border rounded-lg hover:border-[#FF7F66] transition-colors cursor-pointer">
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
          {[{label:"White",hex:"#FFFFFF",border:"#E5E5E5"},{label:"Grey",hex:"#F5F5F5",border:"#D1D1D1"},{label:"Ivory",hex:"#FDFAF0",border:"#D9D5C0"},{label:"Pink",hex:"#FFF0F5",border:"#F4B8D0"},{label:"Magenta",hex:VI_COLORS.brandMagenta,border:VI_COLORS.brandMagenta},{label:"Black",hex:"#000000",border:"#000000"}].map((color)=>{
            const active=(content.backgroundColor||"#FFFFFF")===color.hex;
            return (
              <button key={color.hex} type="button" title={color.label} onClick={()=>onContentChange({...content,backgroundColor:color.hex})}
                className={`shrink-0 flex flex-col items-center gap-0.5 rounded-md border-2 py-1 px-1.5 text-center transition-all ${active?"border-[#FF7F66] bg-[#FF7F66]/6":"border-gray-200 hover:border-gray-300 bg-white"}`}>
                <span className="h-6 w-6 shrink-0 rounded-sm" style={{background:color.hex,border:`1px solid ${color.border}`}}/>
                <span className={`max-w-[3.25rem] truncate text-[8px] font-medium leading-tight ${active?"text-[#FF7F66]":"text-gray-600"}`}>{color.label}</span>
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
              {["#000000", "#FFFFFF", VI_COLORS.brandMagenta, "#6B7280", "#3B82F6", "#EF4444"].map((color)=>(
                <button key={color} onClick={()=>onContentChange({...content,titleColor:color})}
                  className={`w-full h-8 rounded border-2 ${(content.titleColor||"#000000")===color?"border-[#FF7F66] scale-110":"border-gray-300"} transition-all`}
                  style={{backgroundColor:color}}/>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500">{content.title.length} characters</p>
      </div>
      <div className="space-y-3"><Label className="text-sm font-medium">Subtitle</Label><Textarea value={content.subtitle} onChange={(e)=>onContentChange({...content,subtitle:e.target.value})} placeholder="Add a supporting subtitle" rows={2} className="resize-none"/></div>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Body Text</Label>
        <Textarea
          value={content.bodyText ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onContentChange((prev) => applyBodyBlockTextEdit(prev, "body-1", v));
          }}
          placeholder="Add detailed information or key points"
          rows={5}
          className="resize-none"
        />
      </div>
      <div className="border-t border-gray-200 pt-6 space-y-6">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#FF7F66]"/>Brand Assets</h3>
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
    </TooltipProvider>
  );
}
