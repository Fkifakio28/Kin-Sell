import { useParams } from "react-router-dom";
import { lazy, Suspense } from "react";

const PublicProfilePage = lazy(() =>
  import("../../features/public-pages/PublicProfilePage").then(m => ({ default: m.PublicProfilePage }))
);
const BusinessShopPage = lazy(() =>
  import("../../features/public-pages/BusinessShopPage").then(m => ({ default: m.BusinessShopPage }))
);

export function PublicProfileWrapper() {
  const { username } = useParams<{ username: string }>();
  if (!username) return null;
  return (
    <Suspense fallback={<div className="ks-page-loader">Chargement…</div>}>
      <PublicProfilePage username={username} />
    </Suspense>
  );
}

export function BusinessShopWrapper() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return null;
  return (
    <Suspense fallback={<div className="ks-page-loader">Chargement…</div>}>
      <BusinessShopPage slug={slug} />
    </Suspense>
  );
}
