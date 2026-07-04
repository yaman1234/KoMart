import { CURRENCY_SYMBOL } from '@/constants';
import type { CatalogOffer, CatalogProduct } from '@/types';

function isOfferCurrentlyActive(offer: CatalogOffer): boolean {
  const now = Date.now();
  if (offer.startsAt && new Date(offer.startsAt).getTime() > now) return false;
  if (offer.endsAt && new Date(offer.endsAt).getTime() < now) return false;
  return true;
}

function offerMatchesProduct(offer: CatalogOffer, product: CatalogProduct): boolean {
  if (offer.ruleType.startsWith('product_')) {
    return offer.productIds.length > 0 && offer.productIds.includes(product.id);
  }
  if (offer.ruleType.startsWith('category_')) {
    return Boolean(offer.category) && offer.category === product.category;
  }
  if (offer.ruleType.startsWith('cart_')) {
    return true;
  }
  return false;
}

function formatOfferLabel(offer: CatalogOffer): string {
  const amount = offer.ruleType.includes('percent')
    ? `${offer.value}% off`
    : `${CURRENCY_SYMBOL} ${offer.value} off`;
  return offer.code ? `${amount} (${offer.code})` : amount;
}

export function getCatalogDiscountLabel(
  product: CatalogProduct,
  offers: CatalogOffer[],
): string | null {
  for (const offer of offers) {
    if (!isOfferCurrentlyActive(offer)) continue;
    if (offerMatchesProduct(offer, product)) {
      return formatOfferLabel(offer);
    }
  }
  return null;
}

export function buildCatalogDiscountMap(
  products: CatalogProduct[],
  offers: CatalogOffer[],
): Map<string, string> {
  const activeOffers = offers.filter(isOfferCurrentlyActive);
  const map = new Map<string, string>();
  for (const product of products) {
    for (const offer of activeOffers) {
      if (offerMatchesProduct(offer, product)) {
        map.set(product.id, formatOfferLabel(offer));
        break;
      }
    }
  }
  return map;
}

export function hasActiveDiscount(
  product: CatalogProduct,
  offers: CatalogOffer[],
): boolean {
  return offers.some(
    (offer) => isOfferCurrentlyActive(offer) && offerMatchesProduct(offer, product),
  );
}
