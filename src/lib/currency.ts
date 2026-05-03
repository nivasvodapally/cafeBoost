/** Centralised currency rendering. Defaults to INR (₹) since this build targets India. */
export function currencySymbol(code?: string | null): string {
  const c = (code ?? "INR").toUpperCase();
  if (c === "INR") return "₹";
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  if (c === "GBP") return "£";
  return c + " ";
}

export function fmtMoney(amount: number | string, code?: string | null): string {
  const n = Number(amount) || 0;
  return `${currencySymbol(code)}${n.toFixed(2)}`;
}