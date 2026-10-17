"use client";

import Image from "next/image";
import { useState } from "react";
import { site } from "@/config/site";

export function ProfileAvatar({ size = 44, src }: { size?: number; src?: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span
      role="img"
      aria-label={`Foto de perfil de ${site.author}`}
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-(--site-avatar) font-sans font-semibold text-(--site-link)"
      style={{ width: size, height: size }}
    >
      <span aria-hidden className="text-[1.15rem]">K</span>
      {src && !imageFailed ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={`${size}px`}
          unoptimized
          className="object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </span>
  );
}