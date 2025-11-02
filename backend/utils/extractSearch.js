export async function extractProductsFromSearchPage(page, limit = 20) {
  // Generic approach: find anchors that link to product pages
  const anchors = await page.$$eval('a[href*="/products/"], a[href*="/product/"], a[href*="/collections/"]', els => {
    return els.map(a => {
      const titleEl = a.querySelector('h2, h3, .product-title, .title, .name');
      const priceEl = a.querySelector('.price, .product-price, .money, .price-item');
      const imgEl = a.querySelector('img');
      return {
        href: a.href,
        title: titleEl ? titleEl.innerText.trim() : (a.title || null),
        price: priceEl ? priceEl.innerText.trim() : null,
        image: imgEl ? (imgEl.src || imgEl.getAttribute('data-src')) : null
      };
    });
  });
  // filter and dedupe
  const filtered = anchors.filter(a => a.title || a.price || a.href).slice(0, limit);
  return filtered;
}

export function extractFromSuggestJson(json) {
  // VERY ADAPTIVE: inspect and find product-like entries
  const items = [];
  function pushIf(obj) {
    if (obj && (obj.url || obj.title || obj.handle)) {
      items.push({
        title: obj.title || obj.handle || null,
        url: obj.url || (obj.handle ? `/products/${obj.handle}` : null),
        price: obj.price || null,
        image: obj.image || null
      });
    }
  }
  if (Array.isArray(json)) json.forEach(pushIf);
  if (json.resources && json.resources.results) {
    for (const k in json.resources.results) {
      const arr = json.resources.results[k] || [];
      arr.forEach(pushIf);
    }
  }
  if (json.results) json.results.forEach(pushIf);
  return items;
}