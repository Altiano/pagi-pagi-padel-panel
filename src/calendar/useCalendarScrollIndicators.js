import { useEffect, useRef, useState } from 'react';
import { isTodayDate, scrollDayCalendarToCurrentTime } from '../lib/datetime.js';

export function useCalendarScrollIndicators({ activeBookings, isLoading, openHour, selectedDate, view }) {
  const [hiddenAboveCount, setHiddenAboveCount] = useState(0);
  const [hiddenBelowCount, setHiddenBelowCount] = useState(0);
  const calendarPanelRef = useRef(null);
  const autoDayScrollKeyRef = useRef('');

  useEffect(() => {
    if (view !== 'day' || isLoading || !isTodayDate(selectedDate)) {
      autoDayScrollKeyRef.current = '';
      return undefined;
    }

    if (autoDayScrollKeyRef.current === selectedDate) return undefined;
    autoDayScrollKeyRef.current = selectedDate;

    const frame = window.requestAnimationFrame(() => {
      scrollDayCalendarToCurrentTime(calendarPanelRef.current, openHour);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isLoading, openHour, selectedDate, view]);

  useEffect(() => {
    const panel = calendarPanelRef.current;
    if (!panel || view !== 'day' || isLoading) {
      setHiddenAboveCount(0);
      setHiddenBelowCount(0);
      return undefined;
    }

    const updateHiddenBookings = () => {
      const panelRect = panel.getBoundingClientRect();
      const headerRect = panel.querySelector('.day-calendar-header')?.getBoundingClientRect();
      const visibleTop = Math.max(panelRect.top, headerRect?.bottom || panelRect.top);
      const visibleBottom = panelRect.bottom - 24;
      const blocks = Array.from(panel.querySelectorAll('.booking-block'));
      const above = blocks.filter((block) => block.getBoundingClientRect().bottom < visibleTop + 8);
      const below = blocks.filter((block) => block.getBoundingClientRect().top > visibleBottom);
      setHiddenAboveCount(above.length);
      setHiddenBelowCount(below.length);
    };

    updateHiddenBookings();
    panel.addEventListener('scroll', updateHiddenBookings, { passive: true });
    window.addEventListener('resize', updateHiddenBookings);

    return () => {
      panel.removeEventListener('scroll', updateHiddenBookings);
      window.removeEventListener('resize', updateHiddenBookings);
    };
  }, [activeBookings, isLoading, view]);

  return {
    calendarPanelRef,
    hiddenAboveCount,
    hiddenBelowCount,
  };
}
