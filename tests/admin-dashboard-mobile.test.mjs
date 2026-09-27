/**
 * Admin Dashboard — Mobile-compact layout  (UI/UX spec tests)
 *
 * These tests verify:
 *  - JSX class names applied in AdminDashboard.tsx
 *  - CSS rules present in globals.css (mobile media block)
 *  - No backend / data-flow regressions (class names only; no API mocking)
 */

import assert from 'assert';
import { test } from 'node:test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const tsx = readFileSync(join(ROOT, 'src/components/admin/AdminDashboard.tsx'), 'utf8');
const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');

// ─── JSX structural checks ───────────────────────────────────────────────────

test('KPI section has admin-kpi-grid class', () => {
  assert.ok(tsx.includes('admin-kpi-grid'), 'admin-kpi-grid must appear in AdminDashboard.tsx');
});

test('KPI section defaults to grid-cols-2 in JSX', () => {
  // The JSX sets the base grid: grid-cols-2 (was grid-cols-1 → min-[400px]:grid-cols-2)
  assert.ok(
    tsx.includes('admin-kpi-grid grid grid-cols-2'),
    'KPI grid should start at 2 columns on mobile'
  );
});

test('KPI section has aria-label="Statistik toko"', () => {
  assert.ok(tsx.includes('aria-label="Statistik toko"'), 'KPI section aria-label must be present');
});

test('KPI section has data-kpi-grid attribute for targeting', () => {
  assert.ok(tsx.includes('data-kpi-grid="true"'), 'data-kpi-grid attribute must be present');
});

test('Quick-actions grid has admin-quick-grid class', () => {
  assert.ok(tsx.includes('admin-quick-grid'), 'admin-quick-grid must appear in AdminDashboard.tsx');
});

test('Quick-actions grid defaults to 3 columns in JSX', () => {
  assert.ok(
    tsx.includes('admin-quick-grid grid grid-cols-3'),
    'Quick actions must default to 3 columns'
  );
});

test('Quick-action tile inner body has admin-action-body class', () => {
  assert.ok(tsx.includes('admin-action-body'), 'admin-action-body must appear on the flex body inside each action tile');
});

test('Quick-action label has admin-action-label class', () => {
  assert.ok(tsx.includes('admin-action-label'), 'admin-action-label must appear on the label span');
});

test('KPI stat cards still have admin-stat class', () => {
  assert.ok(tsx.includes('admin-card admin-stat'), 'admin-stat class must remain on KPI cards');
});

test('Account card still has admin-account class', () => {
  assert.ok(tsx.includes('admin-account'), 'admin-account class must remain on account card');
});

test('Low-stock KPI uses data-tone="coral"', () => {
  assert.ok(tsx.includes('data-tone={item.tone}'), 'data-tone must be applied dynamically to stat cards');
  assert.ok(tsx.includes('"coral"'), 'coral tone must be defined for low-stock card');
});

test('Quick-action Card wrapper has admin-quick class', () => {
  assert.ok(tsx.includes('admin-quick'), 'Card wrapping quick actions must have admin-quick class');
});

test('Action arrow has admin-action-arrow class', () => {
  assert.ok(tsx.includes('admin-action-arrow'), 'Arrow element must have admin-action-arrow class');
});

test('MobileBottomNav renders 5 tabs', () => {
  // The mobileTabs filter lists 5 ids
  assert.ok(
    tsx.includes('"home", "products", "add", "orders", "testimonials"'),
    'MobileBottomNav must include exactly 5 tab ids'
  );
});

// ─── CSS structure checks ─────────────────────────────────────────────────────

test('globals.css contains mobile-compact media block header comment', () => {
  assert.ok(
    css.includes('Admin Dashboard — Mobile-compact layout'),
    'Mobile-compact block comment must be present in globals.css'
  );
});

test('globals.css locks KPI grid to 2-col at ≤640px', () => {
  assert.ok(
    css.includes('.admin-shell .admin-kpi-grid') &&
    css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'),
    'Must have 2-col KPI grid rule inside @media max-width:640px block'
  );
});

test('globals.css has compact KPI card height at ≤640px', () => {
  assert.ok(
    css.includes('.admin-shell .admin-kpi-grid .admin-stat') &&
    css.includes('min-height: 100px'),
    'KPI card compact min-height must be defined'
  );
});

test('globals.css has compact KPI value font-size at ≤640px', () => {
  // Value is 22px for mobile
  assert.ok(
    css.includes('.admin-stat-value') && css.includes('font-size: 22px'),
    'KPI value compact font-size must be 22px'
  );
});

test('globals.css forces 3-col quick-actions grid at ≤640px', () => {
  assert.ok(
    css.includes('.admin-shell .admin-quick-grid') &&
    css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'),
    'Must have 3-col quick-actions grid rule at ≤640px'
  );
});

test('globals.css sets action tile flex-direction column (icon-top) at ≤640px', () => {
  assert.ok(
    css.includes('.admin-shell .admin-quick-grid .admin-action') &&
    css.includes('flex-direction: column'),
    'Action tile must use column layout (icon-top) on mobile'
  );
});

test('globals.css stacks admin-action-body vertically at ≤640px', () => {
  assert.ok(
    css.includes('.admin-action-body') && css.includes('flex-direction: column'),
    'admin-action-body must be column-direction on mobile'
  );
});

test('globals.css hides action arrow on mobile', () => {
  assert.ok(
    css.includes('.admin-action-arrow') && css.includes('display: none'),
    'Action arrow must be hidden on mobile (saves space in 3-col grid)'
  );
});

test('globals.css has coral left-border accent for low-stock KPI at ≤640px', () => {
  assert.ok(
    css.includes('[data-tone="coral"]') &&
    css.includes('border-left: 4px solid'),
    'Low-stock coral card must have left-border accent on mobile'
  );
});

test('globals.css has blue left-border accent for pending KPI at ≤640px', () => {
  assert.ok(
    css.includes('[data-tone="blue"]') &&
    css.includes('border-left: 4px solid'),
    'Pending blue card must have left-border accent on mobile'
  );
});

test('globals.css night-mode overrides coral border for dark theme', () => {
  assert.ok(
    css.includes('html[data-theme="dark"] body .admin-shell .admin-kpi-grid [data-tone="coral"]'),
    'Night-mode coral border override must be present'
  );
});

test('globals.css night-mode overrides blue border for dark theme', () => {
  assert.ok(
    css.includes('html[data-theme="dark"] body .admin-shell .admin-kpi-grid [data-tone="blue"]'),
    'Night-mode blue border override must be present'
  );
});

test('globals.css scopes all mobile rules inside @media (max-width: 640px)', () => {
  // The block must open the media query before any admin-kpi-grid rule
  const mediaIdx = css.indexOf('@media (max-width: 640px)');
  const kpiIdx = css.indexOf('.admin-shell .admin-kpi-grid');
  assert.ok(mediaIdx !== -1, '@media (max-width: 640px) must be present');
  assert.ok(kpiIdx > mediaIdx, 'KPI grid rule must be inside the mobile media block');
});

test('No admin-stat-ghost visible on mobile (display:none rule exists)', () => {
  assert.ok(
    css.includes('.admin-stat-ghost') && css.includes('display: none !important'),
    'Ghost icon must be hidden on mobile'
  );
});

test('admin-account clock uses border-top on mobile (not border-left)', () => {
  assert.ok(
    css.includes('.admin-shell .admin-account .admin-clock') &&
    css.includes('border-left: none'),
    'Clock must switch to top border on mobile'
  );
});

// ─── Regression checks: key business logic identifiers unchanged ─────────────

test('Revenue fetch URL is unchanged (/api/admin/sales/report?period=bulan)', () => {
  assert.ok(
    tsx.includes('/api/admin/sales/report?period=bulan'),
    'Revenue API URL must remain unchanged'
  );
});

test('monthlyRevenue state and setMonthlyRevenue still present', () => {
  assert.ok(tsx.includes('monthlyRevenue'), 'monthlyRevenue state must be present');
  assert.ok(tsx.includes('setMonthlyRevenue'), 'setMonthlyRevenue setter must be present');
});

test('summary.revenueToday maps to monthlyRevenue', () => {
  assert.ok(
    tsx.includes('revenueToday: monthlyRevenue'),
    'summary.revenueToday must be assigned from monthlyRevenue'
  );
});

test('loadData function still calls all 5 parallel fetches', () => {
  assert.ok(tsx.includes('Promise.all'), 'loadData must use Promise.all');
  assert.ok(tsx.includes('/api/categories'), 'categories fetch must be present');
  assert.ok(tsx.includes('/api/admin/sales/report'), 'revenue fetch must be present');
});