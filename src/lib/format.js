// Currency / status / clipboard formatting helpers.
import { PLACEHOLDER_STATUSES } from '../constants.js';

export function formatStatusText(value) {
  return String(value || 'ready')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}


export function parseMoneyInput(value) {
  return String(value || '').replace(/\D/g, '');
}

export function formatMoneyInput(value) {
  const digits = parseMoneyInput(value);
  if (!digits) return '';
  return `Rp ${new Intl.NumberFormat('id-ID').format(Number(digits))}`;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', { currency: 'IDR', maximumFractionDigits: 0, style: 'currency' }).format(Number(value || 0));
}

export function formatCompactCurrency(value) {
  const amount = Number(value || 0);
  if (!amount) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 1,
    notation: 'compact',
    style: 'currency',
  }).format(amount);
}

export function formatMoney(value, canViewRevenue = true) {
  return canViewRevenue ? formatCurrency(value) : 'Hidden';
}


export function formatStatus(value) {
  return PLACEHOLDER_STATUSES.find((status) => status.value === value)?.label || 'Awaiting payment';
}


export function copyText(value) {
  if (!value) return;
  navigator.clipboard?.writeText(value);
}

