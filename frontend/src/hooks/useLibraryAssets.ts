import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  getLibraryDownloadUrl,
  incrementLibraryDownload,
  isCurrentUserAdmin,
  listLibraryAssets,
  rowToLibraryAsset,
  searchLibraryAssets,
  uploadLibraryAsset,
  type LibraryAsset,
  type LibraryCategory,
  type LibraryFilterCategory,
  type UploadLibraryAssetMetadata,
} from "@/lib/libraryApi";

export type { LibraryAsset, LibraryCategory, LibraryFilterCategory, UploadLibraryAssetMetadata };

type FetchAssetsArgs = { category?: LibraryCategory; query?: string };

export type UseLibraryAssetsResult = {
  assets: LibraryAsset[];
  loading: boolean;
  uploading: boolean;
  uploadProgress: number;
  error: Error | null;
  isAdmin: boolean;
  isAuthenticated: boolean | null;
  isReady: boolean;
  fetchAssets: (args?: FetchAssetsArgs) => Promise<void>;
  searchAssets: (query: string, category?: LibraryCategory) => Promise<void>;
  uploadAsset: (file: File, metadata: UploadLibraryAssetMetadata) => Promise<LibraryAsset | null>;
  incrementDownload: (id: string) => Promise<void>;
  getDownloadUrl: (filePath: string) => Promise<string>;
};

/**
 * 브랜드 라이브러리 에셋 CRUD 훅.
 *
 * - fetchAssets: 카테고리·검색어로 목록 조회 (둘 다 비우면 전체)
 * - searchAssets: name·description ilike 검색
 * - uploadAsset: Storage 업로드 + library_assets insert (관리자 전용)
 * - incrementDownload: 다운로드 카운트 +1 (로컬 상태도 즉시 반영)
 */
export function useLibraryAssets(): UseLibraryAssetsResult {
  const sb = useMemo<SupabaseClient | null>(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const isReady = sb !== null;

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const lastFetchArgsRef = useRef<FetchAssetsArgs | undefined>(undefined);

  // 요청 경합 방지: 마지막 요청만 결과 반영
  const reqIdRef = useRef(0);

  const fetchAssets = useCallback(
    async (args?: FetchAssetsArgs): Promise<void> => {
      if (!sb) return;
      lastFetchArgsRef.current = args;
      const reqId = ++reqIdRef.current;
      setLoading(true);
      setError(null);
      try {
        // 세션이 있으면 갱신해서 토큰 만료로 빈 결과 받는 걸 막는다
        await sb.auth.refreshSession().catch(() => {});
        const { data: userData } = await sb.auth.getUser();
        if (reqId === reqIdRef.current) setIsAuthenticated(Boolean(userData.user));

        // library_assets 테이블 row만 노출. Storage 파일 자동 병합은 사용하지 않음.
        const rows = args?.query?.trim()
          ? await searchLibraryAssets(sb, args.query, { category: args.category })
          : await listLibraryAssets(sb, { category: args?.category });
        if (reqId === reqIdRef.current) {
          setAssets(rows.map(rowToLibraryAsset));
        }
      } catch (e) {
        if (reqId === reqIdRef.current) {
          const err = e instanceof Error ? e : new Error(String(e));
          setError(err);
          setAssets([]);
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [sb],
  );

  const searchAssets = useCallback(
    async (query: string, category?: LibraryCategory): Promise<void> => {
      await fetchAssets({ query, category });
    },
    [fetchAssets],
  );

  const uploadAsset = useCallback(
    async (file: File, metadata: UploadLibraryAssetMetadata): Promise<LibraryAsset | null> => {
      if (!sb) {
        setError(new Error("Supabase 클라이언트가 초기화되지 않았습니다."));
        return null;
      }
      setUploading(true);
      setUploadProgress(0);
      setError(null);
      try {
        const row = await uploadLibraryAsset(sb, file, metadata, (pct) => setUploadProgress(pct));
        const asset = rowToLibraryAsset(row);
        setAssets((prev) => [asset, ...prev]);
        return asset;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [sb],
  );

  const incrementDownload = useCallback(
    async (id: string): Promise<void> => {
      if (!sb) return;
      setAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, downloads: a.downloads + 1 } : a)),
      );
      try {
        await incrementLibraryDownload(sb, id);
      } catch (e) {
        console.warn("[useLibraryAssets] incrementDownload:", e);
      }
    },
    [sb],
  );

  const getDownloadUrl = useCallback(
    async (filePath: string): Promise<string> => {
      if (!sb) throw new Error("Supabase 클라이언트가 초기화되지 않았습니다.");
      return getLibraryDownloadUrl(sb, filePath, 3600);
    },
    [sb],
  );

  useEffect(() => {
    if (!sb) return;
    const refreshAdmin = () => {
      void isCurrentUserAdmin(sb).then(setIsAdmin);
    };
    refreshAdmin();
    const { data: sub } = sb.auth.onAuthStateChange(() => {
      refreshAdmin();
      void fetchAssets(lastFetchArgsRef.current);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, fetchAssets]);

  return {
    assets,
    loading,
    uploading,
    uploadProgress,
    error,
    isAdmin,
    isAuthenticated,
    isReady,
    fetchAssets,
    searchAssets,
    uploadAsset,
    incrementDownload,
    getDownloadUrl,
  };
}
