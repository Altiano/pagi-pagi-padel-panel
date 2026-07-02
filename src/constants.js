import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '';
export const APP_BUILD_COMMIT = import.meta.env.VITE_BUILD_COMMIT || '';
export const APP_BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIMESTAMP || '';
export const navGroups = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard },
      { label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Service',
    items: [
      { label: 'Court Prices', icon: CircleDollarSign },
      { label: 'Event', icon: ClipboardList },
      { label: 'Coach', icon: ShieldCheck },
      { label: 'Add On', icon: Sparkles },
    ],
  },
  {
    label: 'Customer',
    items: [{ label: 'Customers', icon: Users }],
  },
  {
    label: 'Admin',
    items: [{ label: 'Setting', icon: Settings }],
  },
];

export const FALLBACK_MITRA_ID = 'a074e244-76c0-4587-9dff-0c7833f0bfa3';
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MOBILE_VIEW_STORAGE_KEY = 'ppp-panel-view-mode';
export const MOBILE_MEDIA_QUERY = '(max-width: 760px)';
// Theme preference is device-local by design (no cross-device sync). The same
// key is read by the pre-paint inline script in index.html.
export const THEME_STORAGE_KEY = 'ppp-panel-theme';
export const PLACEHOLDER_STATUSES = [
  { label: 'Negotiating', value: 'negotiating' },
  { label: 'Awaiting payment', value: 'awaiting_payment' },
  { label: 'Ready to confirm', value: 'ready_to_confirm' },
  { label: 'Cancelled', value: 'cancelled' },
];
export const CALENDAR_REVENUE_PERMISSION = 'Calendar revenue';
export const CALENDAR_BOOKING_PERMISSION = 'Calendar booking';
export const CALENDAR_DATA_CACHE_TTL_MS = 2 * 60 * 1000;
export const PLACEHOLDER_DURATION_OPTIONS = [
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
];
export const REGISTERED_PLAYER_SEARCH_MIN_LENGTH = 2;
// The capture redacted this field; keep the guessed value centralized for upstream verification.
export const RECEIPT_ATTACHMENT_TYPE = 'payment_proof';
// Upstream cancel validation requires an email even for offline bookings.
export const OFFLINE_CANCEL_EMAIL = 'a@a.com';

export const mobileNavItems = [
  { label: 'Dashboard', icon: LayoutDashboard, nav: 'Dashboard' },
  { label: 'Calendar', icon: CalendarDays, nav: 'Calendar' },
  { label: 'Service', icon: ClipboardList, nav: 'Court Prices' },
  { label: 'Customers', icon: Users, nav: 'Customers' },
  { label: 'Setting', icon: Settings, nav: 'Setting' },
];

export const screenPermissionOptions = navGroups.flatMap((group) => group.items.map((item) => item.label));
export const virtualPermissionGroups = [
  { label: 'Visible screens', options: screenPermissionOptions },
  { label: 'Calendar actions', options: [CALENDAR_BOOKING_PERMISSION] },
  { label: 'Calendar data', options: [CALENDAR_REVENUE_PERMISSION] },
];
export const virtualPermissionOptions = virtualPermissionGroups.flatMap((group) => group.options);
