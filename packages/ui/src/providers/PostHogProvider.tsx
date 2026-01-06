"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = url + `?${searchParams.toString()}`;
      }
      posthog.capture("$pageview", {
        $current_url: url,
      });
    }
  }, [pathname, searchParams, posthog]);

  return null;
}

export interface PostHogProviderProps {
  children: React.ReactNode;
  apiKey?: string;
  apiHost?: string;
}

export function PostHogProvider({
  children,
  apiKey,
  apiHost = "/ingest",
}: PostHogProviderProps) {
  useEffect(() => {
    const key = apiKey || process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) {
      console.warn("PostHog API key not provided");
      return;
    }

    posthog.init(key, {
      api_host: apiHost,
      ui_host: "https://us.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false, // We handle pageviews manually
      capture_exceptions: true,
      debug: process.env.NODE_ENV === "development",
    });
  }, [apiKey, apiHost]);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
