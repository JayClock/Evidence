import type { AttributeAST } from '@evidence-poc/evidence-schema';

const currencies = new Set(Intl.supportedValuesOf('currency'));

/** Format a modeled quantity without guessing a currency or losing a subunit. */
export function formatBusinessQuantity(
  field: AttributeAST,
  value: unknown,
  currencyDisplay: 'name' | 'symbol' = 'name',
): string | undefined {
  let minor: string | number;
  let currency: unknown;
  if (field.valueType === 'money') {
    if (
      !value ||
      typeof value !== 'object' ||
      !('minorUnits' in value) ||
      !('currency' in value) ||
      typeof value.minorUnits !== 'number' ||
      !Number.isSafeInteger(value.minorUnits)
    )
      return;
    minor = value.minorUnits;
    currency = value.currency;
  } else {
    if (typeof value !== 'number' && typeof value !== 'string') return;
    if (
      (field.valueType !== 'int' && field.valueType !== 'uint') ||
      !/单位为\s*(?:CNY\s*分|人民币分)/u.test(field.meaning)
    )
      return /最小(?:货币)?单位/u.test(field.meaning)
        ? undefined
        : String(value);
    if (
      typeof value === 'number'
        ? !Number.isSafeInteger(value)
        : !/^-?\d+$/u.test(value)
    )
      return;
    minor = value;
    currency = 'CNY';
  }
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/u.test(currency)) return;
  if (!currencies.has(currency)) {
    // Document cards retain the supplied amount for an unknown currency. Stories omit its scale.
    return currencyDisplay === 'symbol'
      ? `${minor} ${currency}（最小货币单位）`
      : undefined;
  }
  const format = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    currencyDisplay,
  });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 0;
  const amount = BigInt(minor);
  const scale = 10n ** BigInt(digits);
  const whole = amount / scale;
  const fraction = (amount < 0n ? -amount : amount) % scale;
  return format
    .formatToParts(whole === 0n && amount < 0n ? -0 : whole)
    .map(({ type, value: part }) => {
      if (type === 'fraction') return String(fraction).padStart(digits, '0');
      if (
        type === 'currency' &&
        currencyDisplay === 'name' &&
        currency === 'CNY'
      )
        return '元';
      return part;
    })
    .join('');
}
