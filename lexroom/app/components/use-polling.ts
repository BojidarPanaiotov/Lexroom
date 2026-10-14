"use client";

import { useCallback, useEffect, useState } from "react";

export const POLL_MS = 1500;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export function usePolling<T>(url: string | null, intervalMs: number | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));

  const reload = useCallback(async () => {
    if (!url) return;
    try {
      setData(await fetchJson<T>(url));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The server could not be reached.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const run = () => {
      fetchJson<T>(url)
        .then((next) => {
          if (cancelled) return;
          setData(next);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          setError(caught instanceof Error ? caught.message : "The server could not be reached.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    run();
    if (intervalMs === null) {
      return () => {
        cancelled = true;
      };
    }
    const id = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url, intervalMs]);

  return { data, error, loading, reload };
}
