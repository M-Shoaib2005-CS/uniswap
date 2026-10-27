// Design tokens, taken 1:1 from the Figma file (UniSwap v5: calm white surfaces, one navy accent).
export interface Palette {
  bg: string;
  fill: string;
  border: string;
  ink: string;
  muted: string;
  placeholder: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  primaryText: string;
  success: string;
  successSoft: string;
  warn: string;
  warnSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
}

export const light: Palette = {
  bg: '#FFFFFF',
  fill: '#F4F5F7',
  border: '#E7E9EE',
  ink: '#101828',
  muted: '#667085',
  placeholder: '#98A2B3',
  primary: '#1E3A8A',
  onPrimary: '#FFFFFF',
  primarySoft: '#EEF2FF',
  primaryText: '#1E3A8A',
  success: '#067647',
  successSoft: '#ECFDF3',
  warn: '#B54708',
  warnSoft: '#FFFAEB',
  danger: '#B42318',
  dangerSoft: '#FEF3F2',
  overlay: 'rgba(16,24,40,0.5)',
};

export const dark: Palette = {
  bg: '#0B1020',
  fill: '#151B2E',
  border: '#252D45',
  ink: '#F2F4F7',
  muted: '#98A2B3',
  placeholder: '#667085',
  primary: '#3B5BDB',
  onPrimary: '#FFFFFF',
  primarySoft: '#1B2547',
  primaryText: '#9DB2FF',
  success: '#47CD89',
  successSoft: '#0F2A1E',
  warn: '#FEC84B',
  warnSoft: '#2E2410',
  danger: '#F97066',
  dangerSoft: '#2E1513',
  overlay: 'rgba(0,0,0,0.6)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;
export const TAP = 44; // minimum touch target (NFR-USE-02)

export const FONT = { regular: 'Inter_400Regular', semibold: 'Inter_600SemiBold' } as const;

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'small' | 'smallStrong' | 'caption';

export const textStyles: Record<TextVariant, { fontSize: number; lineHeight: number; fontFamily: string }> = {
  display: { fontSize: 28, lineHeight: 34, fontFamily: FONT.semibold },
  title: { fontSize: 20, lineHeight: 26, fontFamily: FONT.semibold },
  heading: { fontSize: 16, lineHeight: 22, fontFamily: FONT.semibold },
  body: { fontSize: 16, lineHeight: 22, fontFamily: FONT.regular },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontFamily: FONT.semibold },
  small: { fontSize: 14, lineHeight: 20, fontFamily: FONT.regular },
  smallStrong: { fontSize: 14, lineHeight: 20, fontFamily: FONT.semibold },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: FONT.regular },
};
