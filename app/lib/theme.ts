// ── Humble Hello Design System ────────────────────────────────────────────
// Save this to: app/lib/theme.ts

export const C = {
  // Backgrounds
  bg:          "#faf7f2",
  bg2:         "#ffffff",
  bg3:         "#f3ede3",
  bg4:         "#ece3d6",

  // Borders
  border:      "#e8ddd0",
  border2:     "#ddd0bf",

  // Text
  text:        "#241a0f",
  text2:       "#574030",
  text3:       "#8a6e5a",
  text4:       "#b09880",

  // Terracotta — primary brand color
  terra:       "#bf5c38",
  terraLight:  "#f2d5c8",
  terraDark:   "#9a4429",
  terraMuted:  "#e8c4b0",

  // Sage green — positive / success states
  sage:        "#6b9970",
  sageLight:   "#d0e8d3",
  sageDark:    "#3d6b42",

  // Gold — warnings / cooling states
  gold:        "#b8922a",
  goldLight:   "#f0e0b0",

  // Navy — sidebar / dark panels
  navy:        "#1c2b3a",
  navy2:       "#253748",

  // Semantic mappings
  green:       "#6b9970",
  greenLight:  "#d0e8d3",
  blue:        "#2a6496",
  blueLight:   "#d0e0f0",
  red:         "#c0392b",
  redLight:    "#fde8e6",
  amber:       "#b8922a",
  amberLight:  "#f0e0b0",
  pink:        "#a84468",
  pinkLight:   "#f5d0e0",
  purple:      "#6b5c9e",
  purpleLight: "#e5dff5",

  // Sidebar
  sidebar:       "#1c2b3a",
  sidebarText:   "#8a9ab0",
  sidebarActive: "#bf5c38",
};

// ── Typography tokens ─────────────────────────────────────────────────────
// Libre Baskerville = headings
// Inter            = body, UI, buttons, inputs (default)
// ITC Souvenir     = logo only (referenced directly in Sidebar, not via token)
//
// `font` is the default body/UI token and is used as `fontFamily: font` in
// most inline styles across the app. Keeping its name makes no page edits
// necessary.

export const font        = "'Inter', 'Helvetica Neue', sans-serif";
export const fontBody    = "'Inter', 'Helvetica Neue', sans-serif";
export const fontHeading = "'Libre Baskerville', Georgia, serif";
export const fontSerif   = "'Libre Baskerville', Georgia, serif";
export const fontLogo    = "'ITCSouvenir', 'Libre Baskerville', serif";