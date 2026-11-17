const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function isLoopbackHostname(hostname: string) {
  return loopback.has(hostname);
}
export function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      isLoopbackHostname(url.hostname)
    );
  } catch {
    return false;
  }
}
