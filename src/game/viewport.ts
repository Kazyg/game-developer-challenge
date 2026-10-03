// Primary pointer avoids treating a desktop with an additional touchscreen as a phone.
export const MOBILE_VIEWPORT_QUERY = '(max-width: 600px), (pointer: coarse) and (max-width: 1400px) and (max-height: 600px)'

export function isMobileViewport() {
  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
}
