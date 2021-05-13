export function getJoiMiddleware(schema) {
  return async function (ctx, next) {
    const validationResult = schema.validate(ctx.request.body);
    if (validationResult.error != null) {
      return ctx.withError(400, validationResult.error.details[0].message)
    }
    await next();
  }
}