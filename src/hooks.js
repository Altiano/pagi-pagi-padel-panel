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

/* Swipe-down-to-dismiss for mobile bottom sheets. Spread `handlers` and
   `style` onto the sheet element. If the sheet has a scrollable region, mark
   it with `data-sheet-scroll`; dragging only starts while that region sits at
   its scroll top, so list scrolling inside the sheet keeps working. */
export function useSheetDrag(onDismiss) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ active: false, offset: 0, startY: 0 });

  const applyOffset = (value) => {
    dragRef.current.offset = value;
    setOffset(value);
  };

  const handlers = {
    onTouchStart(event) {
      const scrollArea = event.currentTarget.querySelector('[data-sheet-scroll]') || event.currentTarget;
      dragRef.current = { active: scrollArea.scrollTop <= 0, offset: 0, startY: event.touches[0].clientY };
    },
    onTouchMove(event) {
      if (!dragRef.current.active) return;
      const delta = event.touches[0].clientY - dragRef.current.startY;
      if (delta > 0 && !dragging) setDragging(true);
      applyOffset(Math.max(delta, 0));
    },
    onTouchEnd() {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      setDragging(false);
      if (dragRef.current.offset > 110) {
        onDismiss?.();
        return;
      }
      applyOffset(0);
    },
  };

  return {
    handlers,
    style: {
      transform: offset ? `translateY(${offset}px)` : undefined,
      transition: dragging ? 'none' : undefined,
    },
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


