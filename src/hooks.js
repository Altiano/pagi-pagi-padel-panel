import { useEffect, useRef, useState } from 'react';
import { MOBILE_MEDIA_QUERY, MOBILE_VIEW_STORAGE_KEY, THEME_STORAGE_KEY } from './constants.js';

export function usePreferredMobileView(isMobileRoute) {
  const [isSmallScreen, setIsSmallScreen] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });
  const [preference, setPreferenceState] = useState(() => {
    if (typeof window === 'undefined') return 'auto';
    return window.localStorage.getItem(MOBILE_VIEW_STORAGE_KEY) || (isMobileRoute ? 'mobile' : 'auto');
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => setIsSmallScreen(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  function setPreference(nextPreference) {
    setPreferenceState(nextPreference);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MOBILE_VIEW_STORAGE_KEY, nextPreference);
    }
  }

  return {
    isMobileApp: preference === 'mobile' || (preference !== 'desktop' && isSmallScreen),
    preference,
    setPreference,
  };
}

// Browser-chrome colors matching the light/dark app header surfaces.
const THEME_META_COLORS = { light: '#fbfcf8', dark: '#242520' };

export function getStoredThemePreference() {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'dark' || stored === 'system' ? stored : 'light';
}

// Sets html[data-theme] (which flips color-scheme, and with it every
// light-dark() color) and keeps the theme-color metas in sync so the browser
// chrome / PWA status bar matches. No attribute (or 'light') means light —
// the default; 'system' follows the OS preference.
export function applyThemePreference(preference) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = preference;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const systemScheme = (meta.getAttribute('media') || '').includes('dark') ? 'dark' : 'light';
    const effective = preference === 'system' ? systemScheme : preference;
    meta.setAttribute('content', THEME_META_COLORS[effective]);
  });
}

export function useThemePreference() {
  const [preference, setPreferenceState] = useState(getStoredThemePreference);

  function setPreference(nextPreference) {
    setPreferenceState(nextPreference);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    }
    applyThemePreference(nextPreference);
  }

  return { preference, setPreference };
}

export function useEscapeKey(onEscape, enabled = true) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onEscapeRef.current?.();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}


