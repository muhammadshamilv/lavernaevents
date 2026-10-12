import { useEffect } from "react";
import { siteConfig } from "@/lib/siteConfig";

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}

// Sets the tab title, description and share-preview text for a public page.
// Pass null for the home page to use the full default title.
export function usePageMeta(title: string | null, description?: string) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${siteConfig.name}` : siteConfig.defaultTitle;
    const fullDescription = description ?? siteConfig.defaultDescription;
    const url = `${window.location.origin}${window.location.pathname}`;

    document.title = fullTitle;
    setMeta('meta[name="description"]', "name", "description", fullDescription);
    setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    setMeta('meta[property="og:description"]', "property", "og:description", fullDescription);
    setMeta('meta[property="og:url"]', "property", "og:url", url);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", fullTitle);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", fullDescription);
    setCanonical(url);
  }, [title, description]);
}