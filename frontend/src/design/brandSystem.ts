import type { BrandColors, BrandFonts } from "./types";

// Fixed brand color palette
export const brandColors: BrandColors = {
  primary: '#0066FF',
  secondary: '#6366F1',
  accent: '#F59E0B',
  neutral: '#6B7280',
  text: '#111827',
  background: '#FFFFFF',
};

// Locked typography system
export const brandFonts: BrandFonts = {
  heading: 'Inter',
  subheading: 'Inter',
  body: 'Inter',
};

// Typography scale (locked sizes)
export const typographyScale = {
  basic: {
    title: { size: 48, lineHeight: 1.2, weight: 700 },
    subtitle: { size: 24, lineHeight: 1.4, weight: 500 },
    body: { size: 16, lineHeight: 1.6, weight: 400 },
  },
  informational: {
    title: { size: 40, lineHeight: 1.3, weight: 600 },
    subtitle: { size: 20, lineHeight: 1.5, weight: 500 },
    body: { size: 14, lineHeight: 1.7, weight: 400 },
  },
  'no-limit': {
    title: { size: 64, lineHeight: 1.1, weight: 900 },
    subtitle: { size: 32, lineHeight: 1.3, weight: 700 },
    body: { size: 18, lineHeight: 1.5, weight: 500 },
  },
};

// Spacing system (auto-applied)
export const spacingRules = {
  basic: {
    titleToSubtitle: 16,
    subtitleToBody: 24,
    bodyLineSpacing: 8,
    edgePadding: 48,
  },
  informational: {
    titleToSubtitle: 12,
    subtitleToBody: 16,
    bodyLineSpacing: 6,
    edgePadding: 32,
  },
  'no-limit': {
    titleToSubtitle: 24,
    subtitleToBody: 32,
    bodyLineSpacing: 12,
    edgePadding: 64,
  },
};