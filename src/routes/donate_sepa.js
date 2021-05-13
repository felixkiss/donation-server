import Joi from "joi";
import {getJoiMiddleware} from "../shared.js";
import {stripe} from "../stripe_helper.js";
import {
  addChargeOrSubscriptionForSource,
  getOrCreateCustomer,
  getOrCreateSource
} from "./donate_shared.js";

export const postDonateSepa = [
  getJoiMiddleware(Joi.object({
    email: Joi.string().email().required(),
    type: Joi.string().allow("one-time", "monthly").required(),
    amount: Joi.number().min(1).max(1000).precision(2).required(),
    sourceId: Joi.string().min(5).max(50).required()
  })),
  async (ctx) => {
    const {email, type, sourceId, amount} = ctx.request.body;
    const customer = await getOrCreateCustomer(ctx, email);

    // Get and check source
    let inputSource = await stripe.sources.retrieve(sourceId);
    if (inputSource.currency !== "eur") {
      return ctx.withError(400, "Donations are only allowed in EUR");
    }
    if (inputSource.type !== "sepa_debit") {
      return ctx.withError(400, "This route only allows for SEPA donations");
    }

    // Check for existing source on the customer
    const source = await getOrCreateSource(ctx, customer, inputSource);

    // Create final payment / subscription
    await addChargeOrSubscriptionForSource(ctx, type, amount, customer, source);

    ctx.body = {
      okay: true,
      mandateUrl: source.sepa_debit.mandate_url
    }
  }
]

