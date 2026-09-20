import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const errorRate = new Rate('errors');
const searchDuration = new Trend('search_duration', true);
const productListDuration = new Trend('product_list_duration', true);
const stockOpDuration = new Trend('stock_op_duration', true);
const authDuration = new Trend('auth_duration', true);
const stockOpsSuccess = new Counter('stock_ops_success');
const stockOpsFail = new Counter('stock_ops_fail');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_ID = __ENV.TENANT_ID || '09570037-3f41-4cb0-ab4d-4d58c16fd29e';
const EMAIL = __ENV.EMAIL || 'k6tester@tenantory.test';
const PASSWORD = __ENV.PASSWORD || 'K6SecurePass123!';

const PRODUCT_ID = __ENV.PRODUCT_ID || '';
const VARIANT_ID = __ENV.VARIANT_ID || '';
const WAREHOUSE_ID = __ENV.WAREHOUSE_ID || '';

export const options = {
  scenarios: {
    catalog_reads: {
      executor: 'ramping-vus',
      exec: 'catalogReads',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    search_load: {
      executor: 'constant-arrival-rate',
      exec: 'searchLoad',
      rate: 50,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 30,
      maxVUs: 100,
      startTime: '1m',
    },
    stock_ops: {
      executor: 'ramping-arrival-rate',
      exec: 'stockOperations',
      startRate: 5,
      timeUnit: '1s',
      stages: [
        { duration: '20s', target: 20 },
        { duration: '40s', target: 40 },
        { duration: '20s', target: 5 },
      ],
      preAllocatedVUs: 40,
      maxVUs: 80,
      startTime: '2m',
    },
    auth_burst: {
      executor: 'constant-arrival-rate',
      exec: 'authBurst',
      rate: 10,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 10,
      maxVUs: 30,
      startTime: '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<800'],
    errors: ['rate<0.1'],
    search_duration: ['p(95)<500'],
    product_list_duration: ['p(95)<100'],
    stock_op_duration: ['p(95)<400'],
    auth_duration: ['p(95)<500'],
  },
};

function makeHeaders(token, tenantId) {
  return {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Id': tenantId,
    'Content-Type': 'application/json',
  };
}

function safeParse(body) {
  try {
    return JSON.parse(body);
  } catch (_) {
    return null;
  }
}

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': TENANT_ID,
      },
    },
  );

  check(loginRes, {
    'login succeeded': (r) => r.status === 200 || r.status === 201,
  });

  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error(`Login failed: ${loginRes.status} ${loginRes.body}`);
    return { token: '', tenantId: TENANT_ID, productId: '', variantId: '', warehouseId: '' };
  }

  // The login endpoint returns the raw JWT string (not a JSON-quoted string)
  let token = String(loginRes.body).trim();
  if (token.startsWith('"')) {
    token = JSON.parse(token);
  }
  console.log(`[setup] Authenticated as ${EMAIL} for tenant ${TENANT_ID}`);

  let productId = PRODUCT_ID;
  let variantId = VARIANT_ID;
  let warehouseId = WAREHOUSE_ID;

  if (!productId) {
    const prodRes = http.get(
      `${BASE_URL}/api/v1/products?page=1&limit=1`,
      { headers: makeHeaders(token, TENANT_ID) },
    );
    if (prodRes.status === 200) {
      const body = safeParse(prodRes.body);
      if (body && body.data && body.data.length > 0) {
        productId = body.data[0].id;
        console.log(`[setup] Discovered product: ${productId}`);
      }
    }
  }

  if (productId && !variantId) {
    const varRes = http.get(
      `${BASE_URL}/api/v1/products/${productId}/variants?page=1&limit=1`,
      { headers: makeHeaders(token, TENANT_ID) },
    );
    if (varRes.status === 200) {
      const body = safeParse(varRes.body);
      if (body && body.data && body.data.length > 0) {
        variantId = body.data[0].id;
        console.log(`[setup] Discovered variant: ${variantId}`);
      }
    }
  }

  if (!warehouseId) {
    const whRes = http.get(
      `${BASE_URL}/api/v1/warehouse?page=1&limit=1`,
      { headers: makeHeaders(token, TENANT_ID) },
    );
    if (whRes.status === 200) {
      const body = safeParse(whRes.body);
      if (body && body.data && body.data.length > 0) {
        warehouseId = body.data[0].id;
        console.log(`[setup] Discovered warehouse: ${warehouseId}`);
      }
    }
  }

  console.log(`[setup] productId=${productId} variantId=${variantId} warehouseId=${warehouseId}`);

  return { token, tenantId: TENANT_ID, productId, variantId, warehouseId };
}

const SEARCH_TERMS = [
  'phone', 'laptop', 'shirt', 'shoes', 'watch',
  'camera', 'book', 'chair', 'table', 'bag',
  'head', 'key', 'mouse', 'screen', 'cable',
];

export function catalogReads(data) {
  if (!data.token) return;

  const h = makeHeaders(data.token, data.tenantId);

  group('GET /products (list)', () => {
    const page = randomIntBetween(1, 5);
    const limit = randomItem([10, 20, 50]);

    const res = http.get(
      `${BASE_URL}/api/v1/products?page=${page}&limit=${limit}`,
      { headers: h, tags: { name: 'GET /products' } },
    );

    productListDuration.add(res.timings.duration);
    const ok = check(res, {
      'products list 200': (r) => r.status === 200,
      'has data array': (r) => {
        const body = safeParse(r.body);
        return body && Array.isArray(body.data);
      },
    });
    if (!ok) errorRate.add(1);
    else errorRate.add(0);
  });

  group('GET /products/:id (single)', () => {
    if (!data.productId) return;

    const res = http.get(
      `${BASE_URL}/api/v1/products/${data.productId}`,
      { headers: h, tags: { name: 'GET /products/:id' } },
    );

    const ok = check(res, {
      'product detail 200': (r) => r.status === 200,
    });
    if (!ok) errorRate.add(1);
    else errorRate.add(0);
  });

  group('GET /products/:id/variants', () => {
    if (!data.productId) return;

    const res = http.get(
      `${BASE_URL}/api/v1/products/${data.productId}/variants?page=1&limit=20`,
      { headers: h, tags: { name: 'GET /products/:id/variants' } },
    );

    const ok = check(res, {
      'variants list 200': (r) => r.status === 200,
    });
    if (!ok) errorRate.add(1);
    else errorRate.add(0);
  });

  group('GET /category/tree', () => {
    const res = http.get(
      `${BASE_URL}/api/v1/category/tree`,
      { headers: h, tags: { name: 'GET /category/tree' } },
    );

    const ok = check(res, {
      'category tree 200': (r) => r.status === 200,
    });
    if (!ok) errorRate.add(1);
  });

  sleep(randomIntBetween(1, 3));
}

export function searchLoad(data) {
  if (!data.token) return;

  const h = makeHeaders(data.token, data.tenantId);
  const q = randomItem(SEARCH_TERMS);
  const type = randomItem(['all', 'product', 'variant']);

  const res = http.get(
    `${BASE_URL}/api/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=10`,
    { headers: h, tags: { name: 'GET /search' } },
  );

  searchDuration.add(res.timings.duration);
  const ok = check(res, {
    'search 200': (r) => r.status === 200,
    'has results': (r) => {
      const body = safeParse(r.body);
      return body && (body.products !== undefined || body.variants !== undefined);
    },
  });
  if (!ok) errorRate.add(1);
  else errorRate.add(0);
}

export function stockOperations(data) {
  if (!data.token || !data.variantId || !data.warehouseId) {
    if (exec.scenario.iterationInTest % 100 === 0) {
      console.warn('[stock_ops] Missing variantId/warehouseId — skipping');
    }
    return;
  }

  const h = makeHeaders(data.token, data.tenantId);

  const doReserve = exec.scenario.iterationInTest % 2 === 0;

  let res;
  if (doReserve) {
    res = http.post(
      `${BASE_URL}/api/v1/inventory/reserve`,
      JSON.stringify({
        variantId: data.variantId,
        warehouseId: data.warehouseId,
        quantity: 1,
      }),
      { headers: h, tags: { name: 'POST /inventory/reserve' } },
    );
  } else {
    res = http.post(
      `${BASE_URL}/api/v1/inventory/release`,
      JSON.stringify({
        variantId: data.variantId,
        warehouseId: data.warehouseId,
        quantity: 1,
      }),
      { headers: h, tags: { name: 'POST /inventory/release' } },
    );
  }

  stockOpDuration.add(res.timings.duration);

  const ok = check(res, {
    'stock op 200': (r) => r.status === 200,
  });

  if (ok) {
    stockOpsSuccess.add(1);
    errorRate.add(0);
  } else {
    stockOpsFail.add(1);
    errorRate.add(1);
  }
}

export function authBurst(data) {
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': data.tenantId,
      },
      tags: { name: 'POST /auth/login' },
    },
  );

  authDuration.add(res.timings.duration);
  const ok = check(res, {
    'login 2xx': (r) => r.status === 200 || r.status === 201,
  });
  if (!ok) errorRate.add(1);
  else errorRate.add(0);
}

export function teardown(data) {
  console.log('[teardown] Load test complete');
}
