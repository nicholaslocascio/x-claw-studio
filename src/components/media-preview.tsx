"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildLocalMediaUrl } from "@/src/lib/media-display";

interface MediaPreviewProps {
  alt: string;
  imageUrl: string | null;
  videoFilePath?: string | null;
  videoUrl?: string | null;
  showVideoByDefault?: boolean;
  playOnClick?: boolean;
  fit?: "cover" | "native";
}

export function MediaPreview({
  alt,
  imageUrl,
  videoFilePath,
  videoUrl: remoteVideoUrl,
  showVideoByDefault = false,
  playOnClick = true,
  fit = "cover"
}: MediaPreviewProps) {
  const resolvedVideoUrl = useMemo(
    () => buildLocalMediaUrl(videoFilePath) ?? remoteVideoUrl ?? null,
    [remoteVideoUrl, videoFilePath]
  );
  const [isPlaying, setIsPlaying] = useState(showVideoByDefault && Boolean(resolvedVideoUrl));
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaClassName = fit === "native" ? "w-full h-auto object-contain" : "h-full w-full object-cover";

  useEffect(() => {
    if (!resolvedVideoUrl) {
      setIsPlaying(false);
      return;
    }

    if (showVideoByDefault) {
      setIsPlaying(true);
    }
  }, [resolvedVideoUrl, showVideoByDefault]);

  useEffect(() => {
    if (!isPlaying || !resolvedVideoUrl || !videoRef.current) {
      return;
    }

    const videoElement = videoRef.current;
    if (!resolvedVideoUrl.includes(".m3u8")) {
      videoElement.src = resolvedVideoUrl;
      return;
    }

    let isCancelled = false;
    let hls: import("hls.js").default | null = null;

    void import("hls.js").then(({ default: Hls }) => {
      if (isCancelled) {
        return;
      }

      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(resolvedVideoUrl);
        hls.attachMedia(videoElement);
        return;
      }

      if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        videoElement.src = resolvedVideoUrl;
      }
    });

    return () => {
      isCancelled = true;
      hls?.destroy();
    };
  }, [isPlaying, resolvedVideoUrl]);

  if (resolvedVideoUrl && isPlaying) {
    return (
      <video
        ref={videoRef}
        poster={imageUrl ?? undefined}
        controls
        autoPlay
        playsInline
        preload="metadata"
        className={mediaClassName}
      />
    );
  }

  if (resolvedVideoUrl) {
    const previewBody = (
      <>
        {imageUrl ? (
          <img src={imageUrl} alt={alt} className={`${mediaClassName} transition-transform duration-200 ease-linear group-hover:scale-[1.02]`} />
        ) : (
          <div className="grid h-full w-full place-items-center bg-black/90 font-[family:var(--font-mono)] text-sm uppercase tracking-[0.26em] text-cyan">
            video ready
          </div>
        )}
        <span className="pointer-events-none absolute inset-0 bg-black/4 transition-colors duration-200 ease-linear group-hover:bg-black/8" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/72 text-slate-950 shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-transform duration-200 ease-linear group-hover:scale-105 group-hover:bg-white/80">
          <span aria-hidden="true" className="ml-0.5 text-sm leading-none">▶</span>
        </span>
      </>
    );

    if (!playOnClick) {
      return <div className="group relative block h-full w-full bg-transparent">{previewBody}</div>;
    }

    return (
      <button
        type="button"
        className="group relative block h-full w-full cursor-pointer bg-transparent p-0"
        onClick={() => setIsPlaying(true)}
        aria-label={`Play video: ${alt}`}
      >
        {previewBody}
      </button>
    );
  }

  if (imageUrl) {
    return <img src={imageUrl} alt={alt} className={mediaClassName} />;
  }

  return (
    <div className="grid h-full w-full place-items-center bg-black/90 font-[family:var(--font-mono)] text-sm uppercase tracking-[0.26em] text-magenta">
      no preview
    </div>
  );
}
