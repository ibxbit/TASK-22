const Joi = require('joi');

const objectId = Joi.string().hex().length(24).messages({
  'string.hex':    '{{#label}} must be a valid id',
  'string.length': '{{#label}} must be a valid id',
});

// ─── Vehicles ────────────────────────────────────────────────────────────────
const vehicleSearch = Joi.object({
  make:        Joi.string().trim(),
  model:       Joi.string().trim(),
  priceMin:    Joi.number().min(0),
  priceMax:    Joi.number().min(0),
  mileageMax:  Joi.number().min(0),
  region:      Joi.string().trim(),
  regDateFrom: Joi.date().iso(),
  regDateTo:   Joi.date().iso(),
  sort:        Joi.string().valid('price', 'mileage', 'registrationDate', 'year'),
  order:       Joi.string().valid('asc', 'desc'),
  page:        Joi.number().integer().min(1).default(1),
  limit:       Joi.number().integer().min(1).max(100).default(20),
});

// ─── Cart ─────────────────────────────────────────────────────────────────────
const addToCart = Joi.object({
  sessionId: Joi.string().trim().min(1).required(),
  vehicleId: objectId.required(),
  addOns:    Joi.array()
    .items(Joi.string().valid('inspection_package', 'extended_warranty'))
    .default([]),
});

const checkout = Joi.object({
  sessionId: Joi.string().trim().min(1).required(),
});

// ─── Orders ───────────────────────────────────────────────────────────────────
const transitionOrder = Joi.object({
  toState:  Joi.string()
    .valid('reserved', 'invoiced', 'settled', 'fulfilled', 'cancelled')
    .required(),
  metadata: Joi.object().default({}),
});

// ─── Payments ─────────────────────────────────────────────────────────────────
const processPayment = Joi.object({
  orderId: objectId.required(),
  method:  Joi.string().valid('cash', 'cashiers_check', 'inhouse_financing').required(),
  amount:  Joi.number().positive().required(),
  details: Joi.object().default({}),
});

const refundPayment = Joi.object({
  reason: Joi.string().trim().allow('').default(''),
});

// ─── Finance ──────────────────────────────────────────────────────────────────
const upsertTaxRate = Joi.object({
  state:     Joi.string().trim().uppercase().length(2).required(),
  county:    Joi.string().trim().allow(null, '').default(null),
  stateTax:  Joi.number().min(0).max(20).required(),
  countyTax: Joi.number().min(0).max(10).default(0),
});

// ─── Experiments ──────────────────────────────────────────────────────────────
const createExperiment = Joi.object({
  name:  Joi.string().trim().min(1).required(),
  scope: Joi.string().valid('listing_layout', 'checkout_steps').required(),
  variants: Joi.array().items(
    Joi.object({
      key:    Joi.string().trim().required(),
      label:  Joi.string().trim().required(),
      weight: Joi.number().min(0).max(100).required(),
      config: Joi.object().default({}),
    })
  ).min(2).required(),
  rollbackVariantKey: Joi.string().trim().default('control'),
});

const updateExperimentStatus = Joi.object({
  status: Joi.string().valid('draft', 'active', 'paused', 'rolled_back').required(),
});

const assignExperiment = Joi.object({
  sessionId:    Joi.string().trim().min(1).required(),
  experimentId: objectId.required(),
});

// ─── Analytics ────────────────────────────────────────────────────────────────
const trackEvent = Joi.object({
  sessionId:    Joi.string().trim().min(1).required(),
  dealershipId: objectId.allow(null).default(null),
  eventType:    Joi.string().trim().min(1).required(),
  category:     Joi.string()
    .valid('listing', 'search', 'cart', 'checkout', 'document', 'payment', 'system')
    .required(),
  entityType:   Joi.string().trim().allow(null).default(null),
  entityId:     objectId.allow(null).default(null),
  properties:   Joi.object().default({}),
});

// ─── Privacy ──────────────────────────────────────────────────────────────────
const recordConsent = Joi.object({
  type:         Joi.string()
    .valid('data_processing', 'marketing', 'financing_terms', 'warranty', 'vehicle_sale')
    .required(),
  version:      Joi.string().trim().min(1).required(),
  consentGiven: Joi.boolean().required(),
  consentText:  Joi.string().allow('', null).default(null),
  orderId:      objectId.allow(null).default(null),
});

module.exports = {
  vehicleSearch,
  trackEvent,
  addToCart,
  checkout,
  transitionOrder,
  processPayment,
  refundPayment,
  upsertTaxRate,
  createExperiment,
  updateExperimentStatus,
  assignExperiment,
  recordConsent,
};
