import type { Template } from "./types";
 
export const templates: Template[] = [
  // Marketing Banners (Online)
  {
    id: 'marketing-web-2',
    name: 'Web Banner (Large Rectangle)',
    category: 'marketing-banner',
    size: { width: 336, height: 280, unit: 'px', name: '336x280' },
    thumbnail: '',
    description: '미디엄 직사각형 디스플레이 광고',
    mediaType: 'online',
  },
  {
    id: 'marketing-hero',
    name: 'Hero Banner',
    category: 'marketing-banner',
    size: { width: 1920, height: 600, unit: 'px', name: '1920x600' },
    thumbnail: '',
    description: '웹사이트 전체 너비 히어로 영역',
    mediaType: 'online',
  },
  {
    id: 'marketing-facebook-cover',
    name: 'Facebook Cover',
    category: 'marketing-banner',
    size: { width: 820, height: 312, unit: 'px', name: '820x312' },
    thumbnail: '',
    description: 'Facebook 페이지 커버 이미지',
    mediaType: 'online',
  },
  {
    id: 'web-notice-3-4',
    name: '웹사내공지',
    category: 'marketing-banner',
    size: { width: 1200, height: 1600, unit: 'px', name: '3:4' },
    thumbnail: '',
    description: '웹 사내 공지 3:4 비율',
    mediaType: 'online',
  },

  // RCS (Online) — MMS/RCS 헤더 카드 이미지 (기본 568×338px)
  {
    id: 'rcs-568x368',
    name: 'RCS (568×338)',
    category: 'rcs',
    size: { width: 568, height: 338, unit: 'px', name: '568x338' },
    thumbnail: '',
    description: 'MMS/RCS 메시지 상단에 먼저 표시되는 헤더 카드 이미지',
    mediaType: 'online',
    customizable: true,
  },
 
  // Posters (Offline) ── 기존 id 유지
  {
    id: 'poster-a1',
    name: 'A1',
    category: 'poster',
    size: { width: 594, height: 841, unit: 'mm', name: 'A1' },
    thumbnail: '',
    description: '초대형 인쇄 포스터 (594x841mm)',
    mediaType: 'offline',
  },
  {
    id: 'poster-a4',
    name: 'A4',
    category: 'poster',
    size: { width: 210, height: 297, unit: 'mm', name: 'A4' },
    thumbnail: '',
    description: '표준 인쇄 포스터 (210x297mm)',
    mediaType: 'offline',
  },
 
  // Social Media (Online)
  {
    id: 'social-instagram-post',
    name: 'Instagram Post',
    category: 'social-media',
    size: { width: 1080, height: 1080, unit: 'px', name: '1:1 Square' },
    thumbnail: '',
    description: 'Instagram 피드용 정사각형 게시물',
    mediaType: 'online',
  },
  {
    id: 'social-instagram-story',
    name: 'Instagram Story',
    category: 'social-media',
    size: { width: 1080, height: 1920, unit: 'px', name: '9:16 Story' },
    thumbnail: '',
    description: '세로형 스토리 포맷',
    mediaType: 'online',
  },
  {
    id: 'social-fhd-vertical',
    name: 'Full HD 세로형',
    category: 'social-media',
    size: { width: 1080, height: 1920, unit: 'px', name: '1080x1920' },
    thumbnail: '',
    description: 'Full HD 세로형 디스플레이',
    mediaType: 'online',
  },
  {
    id: 'social-twitter',
    name: 'Twitter/X Post',
    category: 'social-media',
    size: { width: 1200, height: 675, unit: 'px', name: '16:9' },
    thumbnail: '',
    description: 'Twitter/X 타임라인 최적화',
    mediaType: 'online',
  },
  {
    id: 'social-linkedin',
    name: 'LinkedIn Post',
    category: 'social-media',
    size: { width: 1200, height: 627, unit: 'px', name: 'LinkedIn' },
    thumbnail: '',
    description: '비즈니스 네트워크 게시물',
    mediaType: 'online',
  },
 
  // Presentation (Online)
  {
    id: 'presentation-slide',
    name: 'Presentation Slide',
    category: 'presentation',
    size: { width: 1920, height: 1080, unit: 'px', name: '16:9 Slide' },
    thumbnail: '',
    description: '표준 와이드스크린 프레젠테이션',
    mediaType: 'online',
  },
  {
    id: 'presentation-slide-43',
    name: 'Presentation Slide (4:3)',
    category: 'presentation',
    size: { width: 1024, height: 768, unit: 'px', name: '4:3 Slide' },
    thumbnail: '',
    description: '클래식 프레젠테이션 포맷',
    mediaType: 'online',
  },
 
  // Placard (Offline) ── 기존 id 유지
  {
    id: 'placard-wide-landscape',
    name: '현수막',
    category: 'placard',
    size: { width: 4700, height: 700, unit: 'mm', name: '4700×700mm' },
    thumbnail: '',
    description: '브랜드 가이드 기반 가로형 현수막',
    mediaType: 'offline',
    customizable: true,
  },
  {
    id: 'xbanner',
    name: 'X배너',
    category: 'xbanner',
    size: { width: 600, height: 1800, unit: 'mm', name: '600×1800mm' },
    thumbnail: '',
    description: 'X배너 스탠드형 (규격 수정 가능)',
    mediaType: 'offline',
    customizable: true,
  },

  // Safety & Caution (Offline) — U+ 수리 중 안내 서식 (A4 가로)
  {
    id: 'safety-caution-maintenance',
    name: '안전&주의',
    category: 'safety-caution',
    size: { width: 297, height: 210, unit: 'mm', name: 'A4 가로' },
    thumbnail: '',
    description: '수리·점검 안내 (A4 가로 · 중앙 정렬 · BI · 주의 픽토)',
    mediaType: 'offline',
    customizable: true,
  },
];
 
export const templateCategories = [
  { id: 'marketing-banner', label: '마케팅 배너',   icon: 'LayoutTemplate' },
  { id: 'poster',           label: '포스터',        icon: 'FileImage' },
  { id: 'social-media',     label: '소셜 미디어',   icon: 'Share2' },
  { id: 'internal-notice',  label: '사내 공지',     icon: 'Bell' },
  { id: 'safety-caution',    label: '안전&주의',     icon: 'Signpost' },
  { id: 'presentation',      label: '프레젠테이션',  icon: 'Presentation' },
  { id: 'rcs',              label: 'RCS',           icon: 'LayoutTemplate' },
  { id: 'placard',          label: '현수막',        icon: 'RectangleHorizontal' },
  { id: 'xbanner',          label: 'X배너',         icon: 'RectangleHorizontal' },
];