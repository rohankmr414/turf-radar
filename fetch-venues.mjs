// Builds public/venues.json from Playo's public endpoints. Run: node fetch-venues.mjs
const KEY = 'b4ee93df154de37b0e38aa6a5dfda071aa751bfa'; // public key embedded in playo.co's JS bundle
const ORIGIN = { lat: 12.9433293, lng: 77.6511633 }; // Challaghatta, Bengaluru

async function get(url, init, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const j = await r.json();
      if (j.requestStatus !== 1) throw new Error(`${j.message} ${url}`);
      return j.data;
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

const venues = new Map();
for (let page = 0; page !== -1; ) {
  const d = await get('https://api.playo.io/venue-public/v2/list', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'venue', page, lat: ORIGIN.lat, lng: ORIGIN.lng, sportId: ['SP2'] }),
  });
  for (const v of d.venueList) venues.set(v.id, {
    id: v.id, name: v.name.trim(), area: v.area ?? '', address: v.address ?? '', city: v.city ?? '',
    slug: v.activeKey ?? '', lat: v.lat, lng: v.lng, rating: v.avgRating ?? 0, bookable: !!v.isBookable, minPrice: null, charts: [],
  });
  process.stderr.write(`page ${page}: ${venues.size} venues\n`);
  page = d.nextPage;
}

const fs = await import('node:fs/promises');
const previous = new Map(await fs.readFile('public/venues.json', 'utf8').then(t => JSON.parse(t).venues.map(v => [v.id, v])).catch(() => []));
const list = [...venues.values()];
let priced = 0, failed = 0, kept = 0, next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < list.length) {
    const v = list[next++];
    try {
      const charts = await get(`https://playo.club/book-api/v1/pricing/${v.id}/SP2/`, { headers: { Authorization: KEY } });
      v.charts = charts.map(c => ({ name: c.name.trim(), days: c.dayTimePrice.map(d => ({ day: d.day, times: d.timePrice.map(t => ({ time: t.time, price: Number(t.price.match(/[\d.]+/)?.[0]) })).filter(t => t.price > 0) })) }))
        .filter(c => c.days.some(d => d.times.length));
      const prices = v.charts.flatMap(c => c.days.flatMap(d => d.times.map(t => t.price))).filter(p => p > 0);
      v.minPrice = prices.length ? Math.min(...prices) : null;
      priced++;
    } catch (e) {
      const old = previous.get(v.id); // pricing endpoint intermittently 500s; keep the last known chart
      if (old?.minPrice != null) { v.charts = old.charts; v.minPrice = old.minPrice; kept++; }
      else { failed++; process.stderr.write(`no price: ${v.name}: ${e.message}\n`); }
    }
  }
}));

const km = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };
list.sort((a, b) => km(ORIGIN, a) - km(ORIGIN, b));
await fs.writeFile('public/venues.json', JSON.stringify({ updatedAt: new Date().toISOString(), venues: list }));
console.log(`public/venues.json: ${list.length} venues, ${priced} priced now, ${kept} kept from previous run, ${failed} without price`);
