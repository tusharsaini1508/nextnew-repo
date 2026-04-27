const configuredOrigin = process.env.ALLOWED_ORIGIN?.trim();

export function getCorsHeaders() {
  const allowOrigin = configuredOrigin && configuredOrigin !== '*' ? configuredOrigin : '*';

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    Vary: 'Origin',
  };

  if (allowOrigin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}
