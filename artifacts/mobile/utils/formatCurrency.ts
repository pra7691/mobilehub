/**
 * Formats a number as Indian Rupees.
 * formatINR(1234.5) → "₹1,234.50"
 */
export function formatINR(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
