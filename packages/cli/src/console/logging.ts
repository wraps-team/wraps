export function redactLoggedUrl(url: string): string {
  return url.replace(/([?&])token=[^&]+/g, "$1token=***");
}
