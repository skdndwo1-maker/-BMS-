import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  fetchLibraryAssetsFromApi,
  getLibraryAdminHint,
  getLibraryDownloadUrl,
  incrementLibraryDownload,
  rowToLibraryAsset,
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
 * - fetchAssets: API(service role)로 library_assets 조회 — 로그인·RLS 무관
 * - uploadAsset: admin_users 관리자 전용 (브라우저 직접 업로드 우선)
 * - incrementDownload: 다운로드 카운트 +1
 */
export function useLibraryAssets(): UseLibraryAssetsResult {
  const sb = useMemo<SupabaseClient | null>(() => {
    try {
      return getSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const { isAdmin, isReady: adminReady, refresh: refreshAdmin } = useIsAdmin();

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const lastFetchArgsRef = useRef<FetchAssetsArgs | undefined>(undefined);

  const reqIdRef = useRef(0);

  const refreshAuthState = useCallback(async () => {
    if (!sb) {
      setIsAuthenticated(false);
      return;
    }
    await refreshAdmin();
    const { data: userData } = await sb.auth.getUser();
    setIsAuthenticated(Boolean(userData.user));
  }, [sb, refreshAdmin]);

  const fetchAssets = useCallback(
    async (args?: FetchAssetsArgs): Promise<void> => {
      lastFetchArgsRef.current = args;
      const reqId = ++reqIdRef.current;
      setLoading(true);
      setError(null);
      try {
        await refreshAuthState();

        const rows = await fetchLibraryAssetsFromApi({
          category: args?.category,
          query: args?.query,
        });

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
    [refreshAuthState],
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
        const err = new Error("Supabase 설정이 필요합니다. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 확인해 주세요.");
        setError(err);
        throw err;
      }
      if (!isAdmin) {
        const err = new Error(await getLibraryAdminHint(sb));
        setError(err);
        throw err;
      }
      setUploading(true);
      setUploadProgress(0);
      setError(null);
      try {
        const row = await uploadLibraryAsset(sb, file, metadata, (pct) => setUploadProgress(pct));
        const asset = rowToLibraryAsset(row);
        await fetchAssets(lastFetchArgsRef.current);
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
    [sb, isAdmin, fetchAssets],
  );

  const incrementDownload = useCallback(
    async (id: string): Promise<void> => {
      setAssets((prev) =>
        prev.map((a) => (a.id === id ? { ...a, downloads: a.downloads + 1 } : a)),
      );
      if (!sb) return;
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
      return getLibraryDownloadUrl(sb, filePath, 3600);
    },
    [sb],
  );

  useEffect(() => {
    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange(() => {
      void refreshAuthState();
      void fetchAssets(lastFetchArgsRef.current);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, refreshAuthState, fetchAssets]);

  return {
    assets,
    loading,
    uploading,
    uploadProgress,
    error,
    isAdmin,
    isAuthenticated,
    isReady: adminReady,
    fetchAssets,
    searchAssets,
    uploadAsset,
    incrementDownload,
    getDownloadUrl,
  };
}
