import { useEffect, useRef, useState } from 'react';
import { MOBILE_MEDIA_QUERY, MOBILE_VIEW_STORAGE_KEY } from './constants.js';

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


