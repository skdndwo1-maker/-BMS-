# 브랜드 라이브러리 (Brand Library) 설정 & 자료 업로드 가이드

## 0. 한 번만 하면 되는 초기 세팅

### 0-1. SQL 마이그레이션 적용

Supabase Dashboard → **SQL Editor** → New query 에 다음 두 파일을 차례로 실행합니다.

1. `supabase/migrations/20260424_admin_users.sql` *(이미 적용했다면 스킵)*
2. `supabase/migrations/20260425_library_assets.sql`

이 단계에서:

- `library_assets` 테이블이 만들어지고
- 인증 사용자만 SELECT 가능, `admin_users`만 INSERT/UPDATE/DELETE 가능한 RLS 정책이 적용되며
- `library_increment_downloads(uuid)` RPC가 생성됩니다.
- Storage `brand-library` 버킷에 대한 RLS 정책도 함께 설정됩니다.

### 0-2. Storage 버킷 만들기

Dashboard → **Storage** → "New bucket" 클릭

- 이름: `brand-library`
- **Public bucket: ON** *(다운로드 URL을 그대로 사용하도록)*
- File size limit: 필요 시 조정 (기본 50 MiB → 무거운 PSD/AI 가 있으면 늘리기)
- Allowed MIME types: 비워두면 모든 형식 허용 (PDF, AI, PNG, JPEG, SVG, PSD, XLSX, PPTX 등)

### 0-3. 카테고리 폴더 만들기 *(자동/수동 모두 가능)*

`brand-library` 버킷에서 "Create folder"를 눌러 다음 8개 폴더를 만듭니다.

```
logo/        BI/CI 로고
slogan/      Slogan
icon/        아이콘
pictogram/   픽토그램
image/       포토 라이브러리
template/    템플릿 파일
font/        폰트
guide/       가이드라인
```

> 폴더는 파일을 처음 업로드할 때 자동으로 생성되기도 하지만, 미리 만들어 두면 정리가 깔끔합니다.

### 0-4. 본인을 관리자로 등록

```sql
insert into public.admin_users (user_id, email)
values ('<본인 user_id>', '<본인 이메일>')
on conflict (user_id) do nothing;
```

`<본인 user_id>` 는 Dashboard → Authentication → Users 에서 확인할 수 있습니다.

---

## 1. 자료 업로드 (관리자 작업)

라이브러리에 자료를 추가하려면 **두 단계**가 필요합니다.

### 1-1. 파일 업로드 (Storage)

1. Dashboard → **Storage** → `brand-library` 클릭
2. 등록할 카테고리 폴더 안으로 이동 (예: `template/`)
3. 우측 **Upload file** 버튼 (또는 드래그 앤 드롭) 으로 원하는 파일을 올립니다.
   - 지원 형식: **PDF / AI / PNG / JPEG / SVG / PSD / XLSX / PPTX / TTF / OTF / ZIP** 등 모든 바이너리
4. 업로드가 끝나면 파일을 클릭해 우측 패널의 **Path** 값을 복사해 둡니다.
   예: `template/poster_a2.psd`

> 이미 같은 이름의 파일이 있으면 덮어쓰기 여부를 묻습니다.
> 다른 이름으로 올리고 싶으면 **Rename** 후 다시 시도하세요.

### 1-2. 메타데이터 등록 (Database)

Dashboard → **Database** → **Table editor** → `library_assets` → **Insert row**

다음 항목을 입력합니다.

| 필드 | 예시 | 설명 |
| --- | --- | --- |
| `category` | `template` | 8개 카테고리 중 하나 |
| `name` | `포스터 템플릿 A2` | 화면에 보일 이름 |
| `description` | `A2 포스터, 인쇄 품질` | 카드 하단 설명 (선택) |
| `tags` | `{포스터,인쇄,A2}` | Postgres 배열 (선택) |
| `formats` | `{PSD,AI,PDF}` | 비워두면 확장자에서 자동 추출 |
| `file_path` | `template/poster_a2.psd` | 1-1에서 복사한 경로 (필수) |
| `file_name` | `poster_a2.psd` | 다운로드 시 받을 파일명 |
| `file_size` | `15728640` | 바이트 단위 (선택, Storage에서 확인 가능) |
| `mime_type` | `application/photoshop` | 선택 |
| `is_favorite` | `false` | 즐겨찾기 표시 여부 |

`Save` 클릭 → 라이브러리 페이지를 새로고침하면 즉시 반영됩니다.

### 1-3. SQL로 한 번에 등록하기 (선택)

여러 자료를 한 번에 등록하려면 SQL Editor에서:

```sql
insert into public.library_assets
  (category, name, description, tags, formats, file_path, file_name, file_size, mime_type)
values
  ('template', '포스터 템플릿 A2', 'A2 포스터, 인쇄 품질',
   array['포스터','인쇄','A2'], array['PSD','AI','PDF'],
   'template/poster_a2.psd', 'poster_a2.psd', 15728640, 'application/photoshop'),
  ('font', 'LG Smart UI Bold', '본문/제목용 산세리프',
   array['UI','산세리프'], array['TTF','OTF'],
   'font/lg_smart_ui_bold.ttf', 'lg_smart_ui_bold.ttf', 3355443, 'font/ttf');
```

---

## 2. 자료 삭제

### 2-1. 앱 안에서

라이브러리 페이지에 **관리자 계정으로 로그인**하면 각 카드의 휴지통 아이콘이 활성화됩니다.
클릭 → 확인 → Storage 파일과 DB 메타데이터가 함께 삭제됩니다.

### 2-2. 대시보드에서 직접

Storage 파일과 `library_assets` 행을 각각 삭제하면 됩니다. 둘 중 하나만 지우면

- DB 행만 삭제 → 라이브러리에서 안 보이지만 Storage에 파일이 남음
- Storage 파일만 삭제 → 라이브러리에는 보이지만 다운로드 시 404 발생

이 점에 유의하세요.

---

## 3. 권한 정리

| 동작 | 권한 |
| --- | --- |
| 목록 조회 / 다운로드 | 로그인된 모든 사용자 (RLS: `authenticated`) |
| 업로드 / 수정 / 삭제 | `admin_users` 테이블에 등록된 사용자 |
| 비로그인 사용자 | 라이브러리 접근 불가 (페이지 자체가 로그인 가드) |

> Storage RLS도 동일한 정책이 걸려 있어, 관리자 외 사용자는 Storage REST/SDK로 직접 업로드를 시도해도 실패합니다.

---

## 4. 자주 묻는 질문

**Q1. 업로드한 파일을 미리보기 이미지로 보여주고 싶어요.**

`library_assets.thumbnail_path` 에 별도 이미지(예: `template/poster_a2.preview.png`) 경로를 저장하도록 컬럼을 미리 마련해 두었습니다. 추후 카드 UI에서 이를 우선 사용하도록 확장할 수 있습니다.

**Q2. 파일 크기가 자동으로 채워지면 좋겠어요.**

`storage.objects` 의 메타데이터(`metadata->>'size'`)를 join하여 자동으로 보여줄 수도 있습니다. 필요하면 별도 SQL view를 만들 수 있으니 알려주세요.

**Q3. 한 자료에 여러 형식(PSD/AI/PDF)을 묶어 다운받게 하려면?**

방법 1: 같은 자료의 ZIP 패키지를 업로드하고 그 ZIP 한 개를 등록.
방법 2: 카테고리별로 같은 `name`을 공유하는 행을 여러 개 등록 (PSD, AI, PDF 각각).

**Q4. ‘즐겨찾기’ 표시는 어떻게 켜나요?**

`library_assets.is_favorite` 를 `true` 로 업데이트하면 라이브러리 카드에 하트 아이콘이 표시되고, ‘즐겨찾기만’ 필터에서 노출됩니다.
