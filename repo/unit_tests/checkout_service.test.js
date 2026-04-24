'use strict';

/**
 * Unit tests for checkoutService.splitItems — a pure function with no DB calls.
 * Every assertion here is deterministic and runs without a running MongoDB instance.
 */

const { splitItems } = require('../backend/src/services/checkoutService');

describe('splitItems — grouping', () => {
  test('returns empty array for null input', () => {
    expect(splitItems(null)).toEqual([]);
  });

  test('returns empty array for empty array input', () => {
    expect(splitItems([])).toEqual([]);
  });

  test('single item produces a single group with correct shape', () => {
    const items = [
      { vehicleId: 'v1', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
    ];
    const result = splitItems(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      groupKey:          'supa|wh1|3',
      supplier:          'SupA',
      warehouseLocation: 'WH1',
      turnaroundTime:    3,
    });
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].vehicleId).toBe('v1');
  });

  test('two items sharing the same key are grouped together', () => {
    const items = [
      { vehicleId: 'v1', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
      { vehicleId: 'v2', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
    ];
    const result = splitItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(2);
  });

  test('items with different suppliers produce separate groups', () => {
    const items = [
      { vehicleId: 'v1', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
      { vehicleId: 'v2', supplier: 'SupB', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
    ];
    const result = splitItems(items);
    expect(result).toHaveLength(2);
    const suppliers = result.map(g => g.supplier).sort();
    expect(suppliers).toEqual(['SupA', 'SupB']);
  });

  test('items with different warehouse locations produce separate groups', () => {
    const items = [
      { vehicleId: 'v1', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
      { vehicleId: 'v2', supplier: 'SupA', warehouseLocation: 'WH2', turnaroundTime: 3, addOns: [] },
    ];
    const result = splitItems(items);
    expect(result).toHaveLength(2);
  });

  test('items with different turnaround times produce separate groups', () => {
    const items = [
      { vehicleId: 'v1', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
      { vehicleId: 'v2', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 5, addOns: [] },
    ];
    const result = splitItems(items);
    expect(result).toHaveLength(2);
  });
});

describe('splitItems — key normalization', () => {
  test('groupKey is built from lowercased, trimmed values', () => {
    const items = [
      { vehicleId: 'v1', supplier: '  SupA  ', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
      { vehicleId: 'v2', supplier: 'supa',     warehouseLocation: 'wh1', turnaroundTime: 3, addOns: [] },
    ];
    const result = splitItems(items);
    // Both items normalize to the same key: supa|wh1|3
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(2);
  });

  test('groupKey format is lowercase(supplier)|lowercase(warehouseLocation)|turnaroundTime', () => {
    const items = [
      { vehicleId: 'v1', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 7, addOns: [] },
    ];
    expect(splitItems(items)[0].groupKey).toBe('supa|wh1|7');
  });

  test('supplier field on group retains original trimmed casing (not lowercased)', () => {
    // The groupKey is normalized but the stored supplier/warehouseLocation preserve trim() only
    const items = [
      { vehicleId: 'v1', supplier: '  MySupplier  ', warehouseLocation: 'WH-East', turnaroundTime: 2, addOns: [] },
    ];
    const result = splitItems(items);
    expect(result[0].supplier).toBe('MySupplier');
    expect(result[0].warehouseLocation).toBe('WH-East');
  });
});

describe('splitItems — ordering', () => {
  test('items within a group are sorted by vehicleId string', () => {
    const items = [
      { vehicleId: 'vc', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
      { vehicleId: 'va', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
      { vehicleId: 'vb', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
    ];
    const result = splitItems(items);
    const ids = result[0].items.map(i => i.vehicleId);
    expect(ids).toEqual(['va', 'vb', 'vc']);
  });

  test('groups are returned sorted alphabetically by groupKey', () => {
    const items = [
      { vehicleId: 'v1', supplier: 'ZupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
      { vehicleId: 'v2', supplier: 'AupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
      { vehicleId: 'v3', supplier: 'MupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
    ];
    const result = splitItems(items);
    const keys = result.map(g => g.groupKey);
    expect(keys).toEqual([...keys].sort());
  });

  test('addOns within each item are sorted alphabetically', () => {
    const items = [
      {
        vehicleId: 'v1',
        supplier: 'SupA',
        warehouseLocation: 'WH1',
        turnaroundTime: 3,
        addOns: ['extended_warranty', 'inspection_package'],
      },
    ];
    const result = splitItems(items);
    const addOns = result[0].items[0].addOns;
    expect(addOns).toEqual([...addOns].sort());
  });
});

describe('splitItems — edge cases', () => {
  test('item with no addOns property produces empty addOns array', () => {
    const items = [
      { vehicleId: 'v1', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3 },
    ];
    const result = splitItems(items);
    expect(result[0].items[0].addOns).toEqual([]);
  });

  test('output is fully deterministic — same input twice yields identical output', () => {
    const items = [
      { vehicleId: 'v2', supplier: 'SupB', warehouseLocation: 'WH2', turnaroundTime: 5, addOns: ['inspection_package'] },
      { vehicleId: 'v1', supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, addOns: [] },
    ];
    const r1 = splitItems([...items]);
    const r2 = splitItems([...items]);
    expect(r1).toEqual(r2);
  });

  test('three groups are all present and correctly keyed', () => {
    const items = [
      { vehicleId: 'v1', supplier: 'A', warehouseLocation: 'W1', turnaroundTime: 1, addOns: [] },
      { vehicleId: 'v2', supplier: 'B', warehouseLocation: 'W2', turnaroundTime: 2, addOns: [] },
      { vehicleId: 'v3', supplier: 'C', warehouseLocation: 'W3', turnaroundTime: 3, addOns: [] },
    ];
    const result = splitItems(items);
    expect(result).toHaveLength(3);
    const keys = result.map(g => g.groupKey);
    expect(keys).toContain('a|w1|1');
    expect(keys).toContain('b|w2|2');
    expect(keys).toContain('c|w3|3');
  });
});
