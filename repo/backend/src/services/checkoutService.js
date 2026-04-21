/**
 * Pure splitting function — no DB calls, fully testable.
 *
 * Grouping key: supplier|warehouseLocation|turnaroundTime
 * All values are normalized (lowercase, trimmed) before keying.
 * Items within each group are sorted by vehicleId string for stable order.
 * Groups are returned sorted by groupKey alphabetically.
 *
 * Same input always produces identical output.
 */
function splitItems(items) {
  if (!items || items.length === 0) return [];

  const groups = {};

  // Sort items by vehicleId first — ensures insertion order is deterministic
  const sorted = [...items].sort((a, b) =>
    a.vehicleId.toString().localeCompare(b.vehicleId.toString())
  );

  for (const item of sorted) {
    const key = [
      item.supplier,
      item.warehouseLocation,
      String(item.turnaroundTime),
    ]
      .map(s => s.toLowerCase().trim())
      .join('|');

    if (!groups[key]) {
      groups[key] = {
        groupKey:          key,
        supplier:          item.supplier.trim(),
        warehouseLocation: item.warehouseLocation.trim(),
        turnaroundTime:    item.turnaroundTime,
        items:             [],
      };
    }

    groups[key].items.push({
      vehicleId: item.vehicleId,
      addOns:    [...(item.addOns || [])].sort(),
    });
  }

  // Sort groups by key alphabetically — final determinism guarantee
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => group);
}

module.exports = { splitItems };
