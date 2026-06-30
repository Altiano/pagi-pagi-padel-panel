import { useCallback, useEffect, useMemo, useState } from 'react';
import { getWeekDays, shiftDate, toDateInputValue } from '../lib/datetime.js';

export function useCalendarSelection({ isMobileApp = false } = {}) {
  const [view, setView] = useState(() => (isMobileApp ? 'day' : 'week'));
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);

  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);

  useEffect(() => {
    if (isMobileApp && view !== 'day') setView('day');
  }, [isMobileApp, view]);

  const moveDate = useCallback((days) => {
    setSelectedDate((current) => shiftDate(current, days));
  }, []);

  const moveWeek = useCallback((weeks) => {
    setSelectedDate((current) => shiftDate(current, weeks * 7));
  }, []);

  const closeCalendarDetail = useCallback(() => {
    setSelectedBooking(null);
    setShowSummaryPanel(false);
  }, []);

  return {
    closeCalendarDetail,
    moveDate,
    moveWeek,
    selectedBooking,
    selectedDate,
    setSelectedBooking,
    setSelectedDate,
    setShowSummaryPanel,
    setView,
    showSummaryPanel,
    view,
    weekDays,
  };
}
