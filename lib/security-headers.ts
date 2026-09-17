export function contentSecurityPolicy(nonce: string, production: boolean, backend?: string) {
  let connections = "'self'";
  if (backend) {
    const url = new URL(backend);
    connections += ` ${url.origin} ${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
  }
  if (!production)
    connections += ' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? '' : " 'unsafe-eval'"}`,
    "script-src-attr 'none'",
    // Leaflet positions tiles and pins using inline styles.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src ${connections} https://challenges.cloudflare.com`,
    'frame-src https://challenges.cloudflare.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
