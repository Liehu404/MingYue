import heroOrbit from '../assets/illustrations/hero-orbit.svg';
import resourceGallery from '../assets/illustrations/resource-gallery.svg';
import teamConstellation from '../assets/illustrations/team-constellation.svg';

export const siteImages = {
  hero: heroOrbit,
  resourceGallery,
  teamConstellation,
} as const;

export type SiteImageKey = keyof typeof siteImages;

export function getImage(key: SiteImageKey): string | undefined {
  return siteImages[key];
}

const DEFAULT_BG_GRADIENTS: Record<string, string> = {
  hero: 'linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 40%, #f5f5f7 100%)',
  resource: 'linear-gradient(160deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
  team: 'linear-gradient(135deg, #f5f5f7 0%, #fafafc 50%, #f0f5ff 100%)',
  auth: '#f5f5f7',
  profile: 'linear-gradient(180deg, #f5f5f7 0%, #ffffff 100%)',
  default: '#f5f5f7',
};

export function getDefaultBackground(key?: string): string {
  if (key && DEFAULT_BG_GRADIENTS[key]) return DEFAULT_BG_GRADIENTS[key];
  return DEFAULT_BG_GRADIENTS.default;
}
