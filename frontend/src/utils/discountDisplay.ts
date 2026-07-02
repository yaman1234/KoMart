import type { DiscountRule, DiscountRuleType, Product } from '@/types';

const LINE_RULE_TYPES: DiscountRuleType[] = [
  'product_percent',
  'product_flat',
  'category_percent',
  'category_flat',
];

function isLineDiscountRule(ruleType: DiscountRuleType): boolean {
  return LINE_RULE_TYPES.includes(ruleType);
}

export function isRuleCurrentlyActive(rule: DiscountRule): boolean {
  if (!rule.isActive) return false;
  const now = Date.now();
  if (rule.startsAt && new Date(rule.startsAt).getTime() > now) return false;
  if (rule.endsAt && new Date(rule.endsAt).getTime() < now) return false;
  return true;
}

function ruleMatchesProduct(
  rule: DiscountRule,
  product: Pick<Product, 'id' | 'category'>,
): boolean {
  if (rule.ruleType.startsWith('product_')) {
    return Boolean(rule.productId) && rule.productId === product.id;
  }
  if (rule.ruleType.startsWith('category_')) {
    return Boolean(rule.category) && rule.category === product.category;
  }
  return false;
}

export function getProductLineDiscountRules(
  product: Pick<Product, 'id' | 'category'>,
  rules: DiscountRule[],
): DiscountRule[] {
  return rules
    .filter((rule) => isRuleCurrentlyActive(rule) && isLineDiscountRule(rule.ruleType))
    .filter((rule) => ruleMatchesProduct(rule, product))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
}

export function formatDiscountRuleLabel(rule: DiscountRule): string {
  const amount = rule.ruleType.includes('percent')
    ? `${rule.value}% off`
    : `Rs. ${rule.value} off`;
  return rule.code ? `${amount} (${rule.code})` : amount;
}

export function getProductDiscountLabel(
  product: Pick<Product, 'id' | 'category'>,
  rules: DiscountRule[],
): string | null {
  const matched = getProductLineDiscountRules(product, rules);
  return matched[0] ? formatDiscountRuleLabel(matched[0]) : null;
}

export function buildProductDiscountMap(
  products: Pick<Product, 'id' | 'category'>[],
  rules: DiscountRule[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const product of products) {
    const label = getProductDiscountLabel(product, rules);
    if (label) map.set(product.id, label);
  }
  return map;
}
