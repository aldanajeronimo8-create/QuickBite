import fs from 'node:fs';
import path from 'node:path';

export default function handler(_request, response) {
  try {
    const faviconPath = path.join(process.cwd(), 'public', 'favicon.svg');
    const favicon = fs.readFileSync(faviconPath, 'utf8');
    response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.status(200).send(favicon);
  } catch (error) {
    console.error('Ritena favicon could not be read', error);
    response.status(500).end();
  }
}
