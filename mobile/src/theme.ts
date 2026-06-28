/**
 * Design tokens, ported verbatim from the web app's globals.css @theme so the
 * two clients share one brand. The palette is derived from Delhi's night light:
 * warm asphalt darks, a sodium-vapor amber accent, neon violet reserved for
 * underground/premium. Dark only. Never hardcode colors in screens.
 */

export const colors = {
  night: "#0c0a08",
  surface: "#16120e",
  raise: "#1e1914",
  line: "#2b241c",
  ink: "#ede7db",
  inkDim: "#9b9183",
  accent: "#f0a431", // sodium-vapor amber - the brand's default voice
  ember: "#c87c1f",
  under: "#b48aed", // neon violet - underground / premium only
  danger: "#e0654f",
} as const;

export const radius = {
  sm: 10,
  card: 20, // matches web --radius-card: 1.25rem
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 40,
} as const;

/** The signature easing (web --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)). */
export const easeOutExpo = [0.16, 1, 0.3, 1] as const;

// Names match the @expo-google-fonts export keys loaded in app/_layout.tsx.
export const fonts = {
  display: "Fraunces_600SemiBold",
  displayRegular: "Fraunces_400Regular",
  body: "Geist_400Regular",
  bodyMedium: "Geist_500Medium",
  mono: "GeistMono_400Regular",
} as const;

/** The "system voice": mono, wide tracking, uppercase eyebrows + timestamps. */
export const voice = {
  fontFamily: fonts.mono,
  fontSize: 11,
  letterSpacing: 2,
  textTransform: "uppercase" as const,
  color: colors.inkDim,
};

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.ink },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.ink },
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.inkDim },
} as const;
