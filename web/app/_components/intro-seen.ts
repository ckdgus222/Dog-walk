// Shared by the intro, the head script that runs before paint, and the
// browser test setup, so the three never disagree on the key.
export const INTRO_SEEN_KEY = "dog-walk:intro-seen";

// Runs before the first paint. Anything but a first visit to "/" with
// motion allowed and storage readable hides the intro at once.
export const introHeadScript = `try {
  if (location.pathname !== "/" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      localStorage.getItem(${JSON.stringify(INTRO_SEEN_KEY)}) !== null) {
    document.documentElement.dataset.intro = "done";
  }
} catch {
  document.documentElement.dataset.intro = "done";
}`;
