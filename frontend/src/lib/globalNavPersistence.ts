/**
 * 글로벌 네비게이션으로 다른 화면으로 떠나기 직전에 호출되는 임시 저장 훅.
 * 페이지는 mount 시 register, unmount 시 해제.
 */
export type GlobalNavPersistFn = () => void | Promise<void>;

const persistFns = new Set<GlobalNavPersistFn>();

export function registerGlobalNavPersist(fn: GlobalNavPersistFn): () => void {
  persistFns.add(fn);
  return () => {
    persistFns.delete(fn);
  };
}

export async function flushGlobalNavPersistence(): Promise<void> {
  await Promise.all(
    [...persistFns].map((fn) =>
      Promise.resolve()
        .then(() => fn())
        .catch((e) => {
          console.warn("[globalNavPersist]", e);
        }),
    ),
  );
}
