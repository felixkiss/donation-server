import Joi from "joi";
import {getJoiMiddleware} from "../shared.js";
import {stripe} from "../main.js";
import {getOrCreateCustomer, getOrCreatePrice} from "./donate_shared.js";

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
    let source = await stripe.sources.retrieve(sourceId);
    if (source.currency !== "eur") {
      return ctx.withError(400, "Donations are only allowed in EUR");
    }
    if (source.sepa_debit == null) {
      return ctx.withError(400, "This route only allows for SEPA donations");
    }

    ctx.log(`Received source ${source.id}`)

    // Check for existing source on the customer
    const customerSources = await stripe.paymentMethods.list({customer: customer.id, type: "sepa_debit"});
    const existingPaymentMethod = customerSources.data.find(method => method.id.startsWith("src_") &&
      method.sepa_debit.fingerprint === source.sepa_debit.fingerprint);

    if (existingPaymentMethod != null) { // Use existing source
      source = await stripe.sources.retrieve(existingPaymentMethod.id);
      ctx.log(`Reusing existing source ${source.id}`);
    } else { // Attach new source to customer
      await stripe.customers.createSource(customer.id, {source: source.id});
      ctx.log(`Attached new source to customer`)
    }

    // Create final payment / subscription
    ctx.log(`Payment type: ${type}, Amount (EUR): ${amount}`)
    if (type === "one-time") {
      const charge = await stripe.charges.create({
        customer: customer.id,
        amount: amount * 100,
        currency: 'eur',
        source: source.id
      });
      ctx.log(`Created a one time payment ${charge.id}`)
    } else if (type === "monthly") {
      const price = await getOrCreatePrice(ctx, amount, type);
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [
          {price: price.id}
        ],
        default_source: source.id
      });
      ctx.log(`Created a monthly subscription ${subscription.id}`)
    }

    ctx.body = {
      okay: true,
      mandateUrl: source.sepa_debit.mandate_url
    }
  }
]

