"use client";

import { useEffect, useRef } from "react";

// An image held in memory: a picked photo before upload, or a protected
// photo fetched with the login token. The object URL lives only as long as
// this image shows this blob, then it is freed.
export const BlobImage = ({
  blob,
  alt,
  className,
}: {
  blob: Blob;
  alt: string;
  className: string;
}) => {
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const element = image.current;
    if (!element) return;
    const url = URL.createObjectURL(blob);
    element.src = url;
    return () => {
      element.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  // The source is set from the effect above.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={image} className={className} alt={alt} decoding="async" />;
};
