/**
 * Joi validation middleware factory.
 *
 * Usage: router.post('/path', validate(schema), handler)
 *        router.get('/path',  validate(schema, 'query'), handler)
 *
 * On success:  req[source] is replaced with Joi-coerced, stripped value.
 * On failure:  422 with standardized VALIDATION_ERROR response.
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly:   false,
      stripUnknown: true,
      convert:      true,
    });

    if (error) {
      const details = error.details.map(d => ({
        field:   d.path.join('.') || source,
        message: d.message.replace(/['"]/g, ''),
      }));
      return res.status(422).json({
        success: false,
        error: {
          code:    'VALIDATION_ERROR',
          message: 'Request validation failed',
          details,
        },
      });
    }

    req[source] = value;
    next();
  };
}

module.exports = validate;
