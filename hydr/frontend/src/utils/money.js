export function money(paise) {
  return `₹${(Number(paise) / 100).toFixed(0)}`;
}
