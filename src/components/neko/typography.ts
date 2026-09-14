export const nekoText = {
  pageTitle: "neko-text-page-title",
  mainTitle: "neko-text-main-title",
  moduleTitle: "neko-text-module-title",
  cardTitle: "neko-text-card-title",
  body: "neko-text-body",
  support: "neko-text-support",
  button: "neko-text-button",
  tabBarLabel: "neko-text-tab-bar-label",
  badge: "neko-text-badge",
  eyebrow: "neko-text-eyebrow",
  caption: "neko-text-caption",
  micro: "neko-text-micro",
  tiny: "neko-text-tiny",
  display: "neko-text-display",
  iconSmall: "neko-text-icon-small",
  iconMedium: "neko-text-icon-medium",
  iconLarge: "neko-text-icon-large",
  showcaseHero: "neko-text-showcase-hero",
  personaTitleLarge: "neko-text-persona-title-large",
  personaTitleMedium: "neko-text-persona-title-medium",
  personaTitleSmall: "neko-text-persona-title-small",
  personaEditorial: "neko-text-persona-editorial",
  personaEditorialSmall: "neko-text-persona-editorial-small",
  monoCaption: "neko-text-mono-caption",
} as const;

export function nekoTitleForLength(value: string) {
  const length = Array.from(value).length;
  if (length <= 6) return nekoText.personaTitleLarge;
  if (length <= 10) return nekoText.personaTitleMedium;
  return nekoText.personaTitleSmall;
}
