import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import type { DesignContent, DesignStyle, LogoPosition, PosterCategory, AssetLayer, AssetType } from "@/design/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Upload, Image as ImageIcon, Sparkles, Calendar, MapPin, Type,
  AlignLeft, AlignCenter, AlignJustify,
  CornerDownLeft, CornerDownRight, CornerUpLeft, CornerUpRight,
  ChevronDown, ChevronUp, Settings, Shapes, Palette, Trash2, Eye, EyeOff,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ContentPanelProps {
  content: DesignContent;
  onContentChange: (content: DesignContent) => void;
  onShowQuickStart?: () => void;
  templateId?: string;
}

const POSTER_IDS = [
  'poster-a4','poster-a3','poster-a2','poster-a1','poster-a5',
  'a1-poster','a2-poster','a3-poster',
  'notice-a4','notice-a1','notice-half',
];

const PLACARD_IDS = [
  'placard-wide-landscape','placard-1000x600','placard-2000x1000','placard-600x1800',
];

const POSTER_CATEGORIES: {
  key: PosterCategory; label: string; emoji: string; color: string;
  preset: Partial<DesignContent>;
}[] = [
  { key:'basic',         label:'Basic',     emoji:'📄', color:'#6B7280', preset:{ backgroundColor:'#FFFFFF', titleColor:'#1A1A1A', subtitle:'', title:'', bodyText:'', emphasizedTitle:'' } },
  { key:'service',       label:'서비스홍보', emoji:'📡', color:'#3B82F6', preset:{ backgroundColor:'#FFFFFF', titleColor:'#1A1A1A', subtitle:'서비스 안내', title:'LG U+ 5G 서비스.', bodyText:'초고속 네트워크\n전국 커버리지\n24시간 고객지원', emphasizedTitle:'※ 서비스 지역 및 속도는 환경에 따라 다를 수 있습니다.' } },
  { key:'promotion',     label:'프로모션',   emoji:'🎁', color:'#F43182', preset:{ backgroundColor:'#F43182', titleColor:'#FFFFFF', subtitle:'특별 혜택', title:'특별 혜택을 드립니다.', bodyText:'가입 즉시 혜택 제공\n최대 50% 요금 할인\n사은품 증정', emphasizedTitle:'※ 본 프로모션은 기간 한정으로 조기 종료될 수 있습니다.' } },
  { key:'mobile-launch', label:'모바일출시', emoji:'📱', color:'#1A1A1A', preset:{ backgroundColor:'#000000', titleColor:'#FFFFFF', subtitle:'신제품 출시', title:'새로운 시작.', bodyText:'최신 스마트폰 출시\n단독 특가 판매\n사전예약 진행 중', emphasizedTitle:'※ 실제 제품 색상은 화면과 다를 수 있습니다.' } },
  { key:'plan-benefit',  label:'요금&혜택',  emoji:'💰', color:'#8B5CF6', preset:{ backgroundColor:'#FFF0F5', titleColor:'#1A1A1A', subtitle:'요금 안내', title:'합리적인 요금제.', bodyText:'월 34,000원부터\n데이터 무제한\n가족 결합 할인', emphasizedTitle:'※ 부가세 포함 금액이며 약정 조건에 따라 상이합니다.' } },
];

function createAssetLayer(src: string, type: AssetType, name: string): AssetLayer {
  return {
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    type, src, name,
    x:0.1, y:0.1, width:0.2, height:0.2,
    visible:true, locked:false, opacity:1, rotation:0,
  };
}

export function ContentPanel({ content, onContentChange, onShowQuickStart, templateId }: ContentPanelProps) {
  const [imagePreview,        setImagePreview]        = useState<string|null>(null);
  const [logoPreview,         setLogoPreview]         = useState<string|null>(null);
  const [showCategoryPalette, setShowCategoryPalette] = useState(false);
  const [showTitleOptions,    setShowTitleOptions]    = useState(false);

  const isPlacard     = PLACARD_IDS.includes(templateId ?? '');
  const isPoster      = POSTER_IDS.includes(templateId ?? '');
  const isContentEmpty = !content.title && !content.subtitle && !content.bodyText;
  const assetLayers   = content.assetLayers ?? [];

  const onAssetDrop = useCallback((files: File[], type: AssetType) => {
    const newAssets = files.map(f => createAssetLayer(URL.createObjectURL(f), type, f.name));
    onContentChange({ ...content, assetLayers: [...assetLayers, ...newAssets] });
  }, [content, assetLayers, onContentChange]);

  const { getRootProps:getPictoRP,  getInputProps:getPictoIP,  isDragActive:isPictoDrag  } = useDropzone({ onDrop:(f)=>onAssetDrop(f,'pictogram'),    accept:{"image/*":[".png",".svg",".jpg"]}, multiple:true });
  const { getRootProps:getIlluRP,   getInputProps:getIlluIP,   isDragActive:isIlluDrag   } = useDropzone({ onDrop:(f)=>onAssetDrop(f,'illustration'),  accept:{"image/*":[".png",".svg",".jpg"]}, multiple:true });
  const { getRootProps:getImageRP,  getInputProps:getImageIP,  isDragActive:isImageDrag  } = useDropzone({ onDrop:(f)=>{ if(f[0]){ onContentChange({...content,image:f[0]}); setImagePreview(URL.createObjectURL(f[0])); }}, accept:{"image/*":[".png",".jpg",".jpeg",".webp"]}, multiple:false });
  const { getRootProps:getLogoRP,   getInputProps:getLogoIP,   isDragActive:isLogoDrag   } = useDropzone({ onDrop:(f)=>{ if(f[0]){ onContentChange({...content,logo:f[0]});  setLogoPreview(URL.createObjectURL(f[0]));  }}, accept:{"image/*":[".png",".jpg",".jpeg",".svg"]},  multiple:false });

  const handleCategorySelect = (cat: typeof POSTER_CATEGORIES[number]) => {
    onContentChange({ ...content, posterCategory:cat.key, ...cat.preset });
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
        {[{key:null,label:"None",desc:"로고 없음"},{key:"CI",label:"CI",desc:"Corporate Identity"},{key:"BI",label:"BI",desc:"Brand Identity"},{key:"SLOGAN",label:"SLOGAN",desc:"슬로건 로고"}].map((opt)=>{
          const active=(content.logoOption??null)===opt.key;
          return (
            <button key={opt.key||"none"} onClick={()=>onContentChange({...content,logoOption:opt.key as any})}
              className={`rounded-xl border-2 py-3 px-2 text-center transition-all ${active?"border-[#F43182] bg-[#F43182]/6":"border-gray-200 hover:border-gray-300 bg-white"}`}>
              <p className={`text-sm font-bold mb-0.5 ${active?"text-[#F43182]":"text-gray-800"}`}>{opt.label}</p>
              <p className="text-[10px] text-gray-400 leading-tight">{opt.desc}</p>
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
      <div className="grid grid-cols-3 gap-2">
        {[
          {key:"top-left"      as LogoPosition,label:"좌상단",  icon:CornerUpLeft},
          {key:"center-top"    as LogoPosition,label:"중앙상단",icon:AlignCenter},
          {key:"top-right"     as LogoPosition,label:"우상단",  icon:CornerUpRight},
          {key:"bottom-left"   as LogoPosition,label:"좌하단",  icon:CornerDownLeft},
          {key:"center-bottom" as LogoPosition,label:"중앙하단",icon:AlignJustify},
          {key:"bottom-right"  as LogoPosition,label:"우하단",  icon:CornerDownRight},
        ].map((pos)=>{
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
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">에셋 (픽토그램 · 일러스트)</p>
      <p className="text-xs text-gray-400">업로드 후 캔버스 위에서 자유롭게 이동 · 리사이즈 가능</p>

      {/* 픽토그램 */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Shapes className="w-3.5 h-3.5"/>픽토그램</Label>
        <div {...getPictoRP()} className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${isPictoDrag?"border-[#F43182] bg-[#F43182]/5":"border-gray-300 hover:border-gray-400"}`}>
          <input {...getPictoIP()}/>
          <div className="flex items-center justify-center gap-2 text-gray-400"><Shapes className="w-4 h-4"/><p className="text-xs">픽토그램 업로드 (여러 개 가능)</p></div>
        </div>
      </div>

      {/* 일러스트 */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Palette className="w-3.5 h-3.5"/>일러스트</Label>
        <div {...getIlluRP()} className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${isIlluDrag?"border-[#F43182] bg-[#F43182]/5":"border-gray-300 hover:border-gray-400"}`}>
          <input {...getIlluIP()}/>
          <div className="flex items-center justify-center gap-2 text-gray-400"><Palette className="w-4 h-4"/><p className="text-xs">일러스트 업로드 (여러 개 가능)</p></div>
        </div>
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
      <div className="h-full overflow-y-auto p-6 space-y-6">
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
            {([{key:"CI",title:"CI",desc:"Corporate Identity"},{key:"BI",title:"BI",desc:"Brand Identity"},{key:"SLOGAN",title:"SLOGAN",desc:"슬로건 로고"}] as const).map((opt)=>{
              const active=(content.logoOption??"CI")===opt.key;
              return (
                <button key={opt.key} onClick={()=>onContentChange({...content,logoOption:opt.key})}
                  className={`rounded-xl border-2 py-3 px-2 text-center transition-all ${active?"border-[#F43182] bg-[#F43182]/6":"border-gray-200 hover:border-gray-300 bg-white"}`}>
                  <p className={`text-sm font-bold mb-0.5 ${active?"text-[#F43182]":"text-gray-800"}`}>{opt.title}</p>
                  <p className="text-[10px] text-gray-400 leading-tight">{opt.desc}</p>
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
            <Label>서브 타이틀</Label>
            <Input value={content.bodyText} onChange={(e)=>onContentChange({...content,bodyText:e.target.value})} placeholder="예) IEC 42001 인증 수여식"/>
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
    const currentCat=POSTER_CATEGORIES.find(c=>c.key===(content.posterCategory??"basic"))??POSTER_CATEGORIES[0];
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-gray-900 mb-1">포스터 콘텐츠</h2>
          <div className="flex flex-col gap-1 mt-1">
            <p className="text-sm text-gray-500">LG U+ 브랜드 가이드 기반 포스터 서식</p>
            <span className="inline-flex items-center gap-1 bg-[#F43182]/10 border border-[#F43182]/25 rounded-full px-2 py-0.5 w-fit">
              <Sparkles className="w-3 h-3 text-[#F43182]"/><span className="text-[10px] font-medium text-[#F43182]">LG U+ Brand Guideline</span>
            </span>
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
                const isActive=(content.posterCategory??"basic")===cat.key;
                return (
                  <button key={cat.key} onClick={()=>handleCategorySelect(cat)}
                    className={`w-full flex items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-all ${isActive?'shadow-sm':'border-gray-200 hover:border-gray-300 bg-white'}`}
                    style={isActive?{borderColor:cat.color,backgroundColor:`${cat.color}10`}:{}}>
                    <span className="text-xl">{cat.emoji}</span>
                    <div className="flex-1"><p className="text-sm font-bold" style={{color:isActive?cat.color:'#374151'}}>{cat.label}</p><p className="text-[10px] text-gray-400">{cat.key==='basic'?'기본 빈 양식':cat.key==='service'?'서비스 소개 및 안내':cat.key==='promotion'?'이벤트 및 프로모션':cat.key==='mobile-launch'?'신규 단말 출시 홍보':'요금제 및 혜택 안내'}</p></div>
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
          <div className="grid grid-cols-6 gap-2">
            {[{label:"White",hex:"#FFFFFF",border:"#E5E5E5"},{label:"Grey",hex:"#F5F5F5",border:"#D1D1D1"},{label:"Ivory",hex:"#FDFAF0",border:"#D9D5C0"},{label:"Pink",hex:"#FFF0F5",border:"#F4B8D0"},{label:"Magenta",hex:"#F43182",border:"#F43182"},{label:"Black",hex:"#000000",border:"#000000"}].map((color)=>{
              const active=(content.backgroundColor||"#FFFFFF")===color.hex;
              return (
                <button key={color.hex} onClick={()=>onContentChange({...content,backgroundColor:color.hex})}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 py-2 px-1 text-center transition-all ${active?"border-[#F43182] bg-[#F43182]/6":"border-gray-200 hover:border-gray-300 bg-white"}`}>
                  <span className="w-7 h-7 rounded-md" style={{background:color.hex,border:`1.5px solid ${color.border}`}}/>
                  <p className={`text-[9px] font-medium ${active?"text-[#F43182]":"text-gray-700"}`}>{color.label}</p>
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
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <span className="inline-block bg-[#F43182] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">뱃지</span>상단 뱃지 텍스트
          </Label>
          <Input value={content.subtitle} onChange={(e)=>onContentChange({...content,subtitle:e.target.value})} placeholder="예) 2025 신제품 출시"/>
          <p className="text-xs text-gray-400">마젠타 알약 형태로 타이틀 위에 표시됩니다</p>
        </div>

        {/* 메인 타이틀 */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Type className="w-3.5 h-3.5 text-gray-500"/>메인 타이틀</Label>
          <Textarea value={content.title} onChange={(e)=>onContentChange({...content,title:e.target.value})} placeholder={"예) 새로운 시작.\n(마침표로 끝나면 마젠타 점으로 변환)"} rows={3} className="font-medium resize-none"/>
          <p className="text-xs text-gray-400">마침표(.)로 끝나면 마젠타 원형 포인트로 자동 변환됩니다</p>
          <div className="flex items-center gap-2 mt-1">
            <Label className="text-xs text-gray-600">텍스트 색상</Label>
            <div className="flex gap-1.5">
              {["#1A1A1A","#FFFFFF","#F43182","#6B7280"].map((c)=>(
                <button key={c} onClick={()=>onContentChange({...content,titleColor:c})}
                  className={`w-6 h-6 rounded border-2 transition-all ${(content.titleColor||"#1A1A1A")===c?"border-[#F43182] scale-110":"border-gray-300"}`}
                  style={{backgroundColor:c}}/>
              ))}
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><AlignLeft className="w-3.5 h-3.5 text-gray-500"/>본문 (불릿 리스트)</Label>
          <Textarea value={content.bodyText} onChange={(e)=>onContentChange({...content,bodyText:e.target.value})} placeholder={"줄바꿈(Enter)으로 항목 구분\n예)\n5G 초고속 네트워크\n스마트홈 연동"} rows={5} className="resize-none"/>
          <p className="text-xs text-gray-400">각 줄이 마젠타 불릿(●)과 함께 표시됩니다</p>
        </div>

        {/* 유의사항 */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-700">하단 유의사항</Label>
          <Textarea value={content.emphasizedTitle||""} onChange={(e)=>onContentChange({...content,emphasizedTitle:e.target.value})} placeholder="예) ※ 본 이미지는 연출된 것입니다." rows={2} className="resize-none text-sm"/>
          <p className="text-xs text-gray-400">하단 좌측에 작은 회색 글씨로 표시됩니다</p>
        </div>

        {/* 로고 */}
        <div className="border-t border-gray-100 pt-4 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">브랜드 로고</p>
          <LogoSelector/><LogoPositionSelector/>
        </div>

        {/* 배경이미지 */}
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5 text-gray-500"/>배경 이미지 (선택)</Label>
          <div {...getImageRP()} className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isImageDrag?"border-[#F43182] bg-[#F43182]/5":"border-gray-300 hover:border-gray-400"}`}>
            <input {...getImageIP()}/>
            {imagePreview?(<div className="space-y-2"><img src={imagePreview} alt="Preview" className="max-h-24 mx-auto rounded"/><p className="text-xs text-gray-500">클릭하여 교체</p></div>):(<div className="space-y-1"><ImageIcon className="w-8 h-8 mx-auto text-gray-400"/><p className="text-xs text-gray-600">이미지 드래그 또는 클릭하여 업로드</p><p className="text-xs text-gray-400">불투명도 15% 자동 적용</p></div>)}
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
    <div className="h-full overflow-y-auto p-6 space-y-6">
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
        <div className="grid grid-cols-6 gap-2">
          {[{label:"White",hex:"#FFFFFF",border:"#E5E5E5"},{label:"Grey",hex:"#F5F5F5",border:"#D1D1D1"},{label:"Ivory",hex:"#FDFAF0",border:"#D9D5C0"},{label:"Pink",hex:"#FFF0F5",border:"#F4B8D0"},{label:"Magenta",hex:"#F43182",border:"#F43182"},{label:"Black",hex:"#000000",border:"#000000"}].map((color)=>{
            const active=(content.backgroundColor||"#FFFFFF")===color.hex;
            return (
              <button key={color.hex} onClick={()=>onContentChange({...content,backgroundColor:color.hex})}
                className={`flex flex-col items-center gap-1 rounded-lg border-2 py-2 px-1 text-center transition-all ${active?"border-[#F43182] bg-[#F43182]/6":"border-gray-200 hover:border-gray-300 bg-white"}`}>
                <span className="w-7 h-7 rounded-md" style={{background:color.hex,border:`1.5px solid ${color.border}`}}/>
                <p className={`text-[9px] font-medium ${active?"text-[#F43182]":"text-gray-700"}`}>{color.label}</p>
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
