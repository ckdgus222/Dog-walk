"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Returns a key for the form and a function to call when saving succeeds.
// Next keeps hidden pages (Activity), so a new-item form would show the
// last saved entry on the next visit. A save marks the form; the key changes
// when the page is hidden, or when it shows again if the save finished while
// it was hidden.
export const useResetAfterSave = (): [key: number, markSaved: () => void] => {
  const [key, setKey] = useState(0);
  const saved = useRef(false);
  const markSaved = useCallback(() => {
    saved.current = true;
  }, []);

  const resetIfSaved = useCallback(() => {
    if (!saved.current) return;
    saved.current = false;
    setKey((key) => key + 1);
  }, []);

  // Setup runs when the page shows again (a save finished while hidden);
  // cleanup runs when it is hidden after a save.
  useLayoutEffect(() => {
    resetIfSaved();
    return resetIfSaved;
  }, [resetIfSaved]);

  return [key, markSaved];
};
