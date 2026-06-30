import { useCallback, useEffect, useRef, useState } from 'react';
import { hasCalendarDataCache, loadCalendarData } from '../api/calendar.js';

const initialCalendarState = {
  bookingsByDate: {},
  courts: [],
  error: '',
  loading: true,
  openHour: null,
};

export function useCalendarData({ cacheScope, mitraId, onSelectionScopeChange, selectedDate, weekDays }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [calendarState, setCalendarState] = useState(initialCalendarState);
  const lastRefreshKeyRef = useRef(refreshKey);
  const lastSelectionScopeRef = useRef({ cacheScope, mitraId, selectedDate });

  const requestCalendarRefresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const forceRefresh = refreshKey !== lastRefreshKeyRef.current;
    const selectionScopeChanged = lastSelectionScopeRef.current.cacheScope !== cacheScope
      || lastSelectionScopeRef.current.mitraId !== mitraId
      || lastSelectionScopeRef.current.selectedDate !== selectedDate;
    const hasFreshCachedData = !forceRefresh && hasCalendarDataCache({ cacheScope, mitraId, selectedDate, weekDays });

    lastRefreshKeyRef.current = refreshKey;
    lastSelectionScopeRef.current = { cacheScope, mitraId, selectedDate };

    setCalendarState((current) => ({ ...current, loading: !hasFreshCachedData, error: '' }));
    if (selectionScopeChanged) onSelectionScopeChange?.();

    loadCalendarData({ cacheScope, forceRefresh, mitraId, selectedDate, weekDays })
      .then((data) => {
        if (active) setCalendarState({ loading: false, error: '', ...data });
      })
      .catch((error) => {
        if (active) setCalendarState((current) => ({ ...current, loading: false, error: error.message }));
      });

    return () => {
      active = false;
    };
  }, [cacheScope, mitraId, onSelectionScopeChange, refreshKey, selectedDate, weekDays]);

  return {
    calendarState,
    requestCalendarRefresh,
  };
}
