import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.K6_BASE_URL || 'https://quick-bite-snowy-ten.vercel.app').replace(/\/$/, '');

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '40s', target: 25 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.98'],
  },
};

export default function () {
  const response = http.get(BASE_URL, {
    tags: { name: 'quickbite_home' },
  });

  check(response, {
    'QuickBite returns 200': (r) => r.status === 200,
    'QuickBite returns HTML': (r) =>
      String(r.headers['Content-Type'] || '').includes('text/html'),
    'QuickBite response is not empty': (r) => r.body.length > 0,
  });

  sleep(1);
}
