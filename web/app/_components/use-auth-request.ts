import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

export const useAuthRequest = () => {
  const pathname = usePathname();
  const activeRequest = useRef<{ left: boolean } | null>(null);

  useLayoutEffect(() => {
    return () => {
      // Leaving is permanent for this request, even if the same URL returns.
      if (activeRequest.current) activeRequest.current.left = true;
    };
  }, [pathname]);

  return () => {
    const request = { left: false };
    activeRequest.current = request;
    return request;
  };
};
