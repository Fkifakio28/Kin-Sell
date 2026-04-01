import { useEffect } from "react";

interface SeoMetaProps {
  title: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  noIndex?: boolean;
}

/**
 * Met à jour dynamiquement le <title> et les <meta> de la page active.
 * Utilisé sur chaque page publique pour améliorer la visibilité Google.
 */
export function SeoMeta({ title, description, canonical, ogImage, noIndex }: SeoMetaProps) {
  useEffect(() => {
    const fullTitle = title.includes("Kin-Sell") ? title : `${title} | Kin-Sell`;

    // Title
    document.title = fullTitle;

    // Description
    let descTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) {
      if (!descTag) {
        descTag = document.createElement("meta");
        descTag.name = "description";
        document.head.appendChild(descTag);
      }
      descTag.content = description;
    }

    // Canonical
    let canonicalTag = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
      if (!canonicalTag) {
        canonicalTag = document.createElement("link");
        canonicalTag.rel = "canonical";
        document.head.appendChild(canonicalTag);
      }
      canonicalTag.href = canonical;
    }

    // OG Title
    let ogTitleTag = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (!ogTitleTag) {
      ogTitleTag = document.createElement("meta");
      ogTitleTag.setAttribute("property", "og:title");
      document.head.appendChild(ogTitleTag);
    }
    ogTitleTag.content = fullTitle;

    // OG Description
    let ogDescTag = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (description) {
      if (!ogDescTag) {
        ogDescTag = document.createElement("meta");
        ogDescTag.setAttribute("property", "og:description");
        document.head.appendChild(ogDescTag);
      }
      ogDescTag.content = description;
    }

    // OG Image
    let ogImgTag = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    if (ogImage) {
      if (!ogImgTag) {
        ogImgTag = document.createElement("meta");
        ogImgTag.setAttribute("property", "og:image");
        document.head.appendChild(ogImgTag);
      }
      ogImgTag.content = ogImage;
    }

    // OG URL
    let ogUrlTag = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (canonical) {
      if (!ogUrlTag) {
        ogUrlTag = document.createElement("meta");
        ogUrlTag.setAttribute("property", "og:url");
        document.head.appendChild(ogUrlTag);
      }
      ogUrlTag.content = canonical;
    }

    // Robots
    let robotsTag = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noIndex) {
      if (!robotsTag) {
        robotsTag = document.createElement("meta");
        robotsTag.name = "robots";
        document.head.appendChild(robotsTag);
      }
      robotsTag.content = "noindex, nofollow";
    } else if (robotsTag && robotsTag.content === "noindex, nofollow") {
      robotsTag.content = "index, follow";
    }

    return () => {
      // Restaurer le titre par défaut au démontage
      document.title = "Kin-Sell — La marketplace de Kinshasa";
    };
  }, [title, description, canonical, ogImage, noIndex]);

  return null;
}
