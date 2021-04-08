import Joi from "joi";
import {getJoiMiddleware} from "../shared.js";
import {stripe} from "../main.js";
import config from "../config.js";

export const postDonate = [
  getJoiMiddleware(Joi.object({
    email: Joi.string().email().required(),
    type: Joi.string().allow("one-time", "monthly").required(),
    amount: Joi.number().min(1).max(1000).precision(2).required(),
    sourceId: Joi.string().min(5).max(100).required()
  })),
  async (ctx) => {
    const {email, type, sourceId, amount} = ctx.request.body;
    let customer = (await stripe.customers.list({
      email: email,
      limit: 1
    })).data[0];
    if (customer == null) {
      ctx.log(`No customer found for email ${email}. Creating a new one`)
      customer = await stripe.customers.create({
        email: email
      });
      ctx.log(`Created new customer ${customer.id}`)
    } else {
      ctx.log(`Found customer for email ${email}, customer ${customer.id}`)
    }

    let source = await stripe.sources.retrieve(sourceId);
    if (source.currency !== "eur") {
      return ctx.withError(400, "Donations are only allowed in EUR");
    }

    ctx.log(`Received source ${source.id}`)

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
      let price = await getPredefiendPrice(amount, type);

      if (price == null) {
        price = await stripe.prices.create({
          currency: "eur",
          unit_amount: amount * 100,
          product: config["stripe"]["monthlyProductId"],
          recurring: {
            interval: "month"
          }
        });
        ctx.log(`No pre-defined price found. Created new price ${price.id}`)
      }

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

async function getPredefiendPrice(amount, type) {
  const price = (config["stripe"]["predefinedPrices"] ?? [])
    .find(price => price.amount === amount && price.interval === type);
  return price != null ? stripe.prices.retrieve(price.id) : null;
}