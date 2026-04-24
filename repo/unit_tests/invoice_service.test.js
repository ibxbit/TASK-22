'use strict';

/**
 * Unit tests for invoiceService.buildInvoicePreview.
 * Uses real MongoDB — connect/clearCollections/disconnect helpers manage lifecycle.
 */

const mongoose = require('mongoose');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeVehicle, makeOrder }                = require('../backend/src/tests/helpers/fixtures');
const Order    = require('../backend/src/models/Order');
const TaxRate  = require('../backend/src/models/TaxRate');
const { buildInvoicePreview } = require('../backend/src/services/invoiceService');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

async function seedRate(overrides = {}) {
  return TaxRate.create({
    state: 'CA', county: null, stateTax: 7.25, countyTax: 0, totalRate: 7.25,
    ...overrides,
  });
}

// Minimal Order factory that lets us set items directly (bypasses the cart flow).
async function makeOrderWithItems(items, overrides = {}) {
  return Order.create({
    cartId:            new mongoose.Types.ObjectId(),
    userId:            new mongoose.Types.ObjectId(),
    dealershipId:      new mongoose.Types.ObjectId(),
    supplier:          'SupA',
    warehouseLocation: 'WH1',
    turnaroundTime:    3,
    groupKey:          `gk-${Date.now()}`,
    items,
    status:            'created',
    ...overrides,
  });
}

describe('buildInvoicePreview', () => {
  test('throws "Order not found" for a non-existent orderId', async () => {
    await seedRate();
    const fakeId = new mongoose.Types.ObjectId();
    await expect(buildInvoicePreview(fakeId, 'CA', null)).rejects.toThrow('Order not found');
  });

  test('returns one lineItem per order item with correct vehiclePrice, make, and model', async () => {
    await seedRate();
    const vehicle = await makeVehicle({ price: 25000 });
    const order   = await makeOrderWithItems([{ vehicleId: vehicle._id, addOns: [] }]);

    const preview = await buildInvoicePreview(order._id, 'CA', null);

    expect(preview.lineItems).toHaveLength(1);
    expect(preview.lineItems[0].vehiclePrice).toBe(25000);
    expect(preview.lineItems[0].make).toBe(vehicle.make);
    expect(preview.lineItems[0].model).toBe(vehicle.model);
    expect(preview.lineItems[0].addOns).toEqual([]);
    expect(preview.lineItems[0].itemTotal).toBe(25000);
  });

  test('inspection_package add-on adds $299 to itemTotal', async () => {
    await seedRate();
    const vehicle = await makeVehicle({ price: 20000 });
    const order   = await makeOrderWithItems([{ vehicleId: vehicle._id, addOns: ['inspection_package'] }]);

    const preview = await buildInvoicePreview(order._id, 'CA', null);

    expect(preview.lineItems[0].addOns).toEqual([{ name: 'inspection_package', price: 299 }]);
    expect(preview.lineItems[0].itemTotal).toBe(20000 + 299);
  });

  test('extended_warranty add-on adds $1499 to itemTotal', async () => {
    await seedRate();
    const vehicle = await makeVehicle({ price: 30000 });
    const order   = await makeOrderWithItems([{ vehicleId: vehicle._id, addOns: ['extended_warranty'] }]);

    const preview = await buildInvoicePreview(order._id, 'CA', null);

    expect(preview.lineItems[0].addOns).toEqual([{ name: 'extended_warranty', price: 1499 }]);
    expect(preview.lineItems[0].itemTotal).toBe(30000 + 1499);
  });

  test('both add-ons together sum correctly', async () => {
    await seedRate();
    const vehicle = await makeVehicle({ price: 20000 });
    const order   = await makeOrderWithItems([
      { vehicleId: vehicle._id, addOns: ['inspection_package', 'extended_warranty'] },
    ]);

    const preview = await buildInvoicePreview(order._id, 'CA', null);

    expect(preview.lineItems[0].itemTotal).toBe(20000 + 299 + 1499);
  });

  test('subtotal is the sum of all lineItem totals', async () => {
    await seedRate();
    const v1 = await makeVehicle({ price: 10000 });
    const v2 = await makeVehicle({ price: 15000 });
    const order = await makeOrderWithItems([
      { vehicleId: v1._id, addOns: [] },
      { vehicleId: v2._id, addOns: ['inspection_package'] },
    ]);

    const preview = await buildInvoicePreview(order._id, 'CA', null);

    const expectedSubtotal = 10000 + (15000 + 299);
    expect(preview.subtotal).toBe(expectedSubtotal);
  });

  test('tax section contains state, county, rate, and computed amounts', async () => {
    await seedRate();
    const vehicle = await makeVehicle({ price: 10000 });
    const order   = await makeOrderWithItems([{ vehicleId: vehicle._id, addOns: [] }]);

    const preview = await buildInvoicePreview(order._id, 'CA', null);

    expect(preview.tax.state).toBe('CA');
    expect(preview.tax.stateRate).toBe(7.25);
    expect(typeof preview.tax.stateAmount).toBe('number');
    expect(typeof preview.tax.totalTaxAmount).toBe('number');
  });

  test('total equals subtotal + totalTaxAmount rounded to 2 dp', async () => {
    await seedRate();
    const vehicle = await makeVehicle({ price: 20000 });
    const order   = await makeOrderWithItems([{ vehicleId: vehicle._id, addOns: [] }]);

    const preview = await buildInvoicePreview(order._id, 'CA', null);

    const expected = parseFloat((preview.subtotal + preview.tax.totalTaxAmount).toFixed(2));
    expect(preview.total).toBe(expected);
  });

  test('uses county-specific tax rate when county is provided', async () => {
    await TaxRate.create({ state: 'CA', county: 'Alameda', stateTax: 7.25, countyTax: 1, totalRate: 8.25 });
    const vehicle = await makeVehicle({ price: 20000 });
    const order   = await makeOrderWithItems([{ vehicleId: vehicle._id, addOns: [] }]);

    const preview = await buildInvoicePreview(order._id, 'CA', 'Alameda');

    expect(preview.tax.county).toBe('Alameda');
    expect(preview.tax.countyRate).toBe(1);
    expect(preview.tax.countyAmount).toBeGreaterThan(0);
  });

  test('vehicle missing from DB results in price=0, make=null, model=null', async () => {
    await seedRate();
    const missingVehicleId = new mongoose.Types.ObjectId();
    const order = await makeOrderWithItems([{ vehicleId: missingVehicleId, addOns: [] }]);

    const preview = await buildInvoicePreview(order._id, 'CA', null);

    expect(preview.lineItems[0].vehiclePrice).toBe(0);
    expect(preview.lineItems[0].make).toBeNull();
    expect(preview.lineItems[0].model).toBeNull();
    expect(preview.lineItems[0].itemTotal).toBe(0);
  });

  test('output includes orderId, supplier, warehouseLocation, and generatedAt', async () => {
    await seedRate();
    const vehicle = await makeVehicle();
    const order   = await makeOrderWithItems([{ vehicleId: vehicle._id, addOns: [] }]);

    const preview = await buildInvoicePreview(order._id, 'CA', null);

    expect(preview.orderId.toString()).toBe(order._id.toString());
    expect(preview.supplier).toBe('SupA');
    expect(preview.warehouseLocation).toBe('WH1');
    expect(typeof preview.generatedAt).toBe('string');
    // generatedAt should be parseable as an ISO date
    expect(new Date(preview.generatedAt).getTime()).toBeGreaterThan(0);
  });
});
