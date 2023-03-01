import {getPricesByProduct, stripe} from "../stripe_helper.js";
import config from "../config.js";
import {handleMauticDonation} from "../mautic_helper.js";
import {getJoiMiddleware} from "../shared.js";
import Joi from "joi";

export const DonationType = Object.freeze({
  OneTime: "one-time",
  Monthly: "monthly"
})

export const donateValidator = [
  getJoiMiddleware(Joi.object({
    name: Joi.string().required().trim().min(3),
    email: Joi.string().trim().required().email(),
    type: Joi.string().allow(DonationType.Monthly).required(),
    amount: Joi.number().min(1).max(500).precision(2).required(),
    sourceId: Joi.string().min(5).max(50).required()
  }))
];

export async function getOrCreateCustomer(ctx, email, name) {
  let customer = (await stripe.customers.list({
    email: email,
    limit: 1
  })).data[0];
  if (customer != null) {
    ctx.log(`Found customer for email ${email}, name ${name}, customer ${customer.id}`);
    if (customer.name == null || customer.name.trim().length < 1) {
      ctx.log(`Updating customer for email ${email}, name ${name}`);
      await stripe.customers.update(customer.id, {
        name,
        email
      });
    }
    return customer;
  }

  ctx.log(`No customer found for email ${email}, name ${name}. Creating a new one`)
  customer = await stripe.customers.create({
    email,
    name
  });
  ctx.log(`Created new customer ${customer.id}`)
  return customer;
}

export async function getOrCreateSource(ctx, customer, source) {
  ctx.log(`Received source ${source.id}`)

  const customerSources = await stripe.paymentMethods.list({customer: customer.id, type: source.type});
  const existingPaymentMethod = customerSources.data
    .filter(method => method.id.startsWith("src_"))
    .find(method => method[source.type].fingerprint === source[source.type].fingerprint);

  if (existingPaymentMethod != null) { // Use existing source
    source = await stripe.sources.retrieve(existingPaymentMethod.id);
    ctx.log(`Reusing existing source ${source.id}`);
  } else { // Attach new source to customer
    await stripe.customers.createSource(customer.id, {source: source.id});
    ctx.log(`Attached new source to customer`)
  }

  return source;
}

export async function getSubscriptionPrice(ctx, amount) {
  const productId = config["stripe"]["monthlyProductId"];
  const allPrices = await getPricesByProduct(productId);
  let price = allPrices.find(price => price.recurring != null
    && price.recurring.interval === "month"
    && price.unit_amount === amount * 100
    && price.currency === "eur");

  if (price != null) {
    ctx.log(`Reusing existing price ${price.id}`);
    return price;
  }

  price = await stripe.prices.create({
    product: productId,
    currency: "eur",
    unit_amount: amount * 100,
    recurring: {
      interval: "month"
    }
  });
  ctx.log(`No price found. Created new price ${price.id}`)
  allPrices.push(price);

  return price;
}

export async function addSubscriptionForSource(ctx, amountEuros, customer, source) {
  ctx.log(`Donation type: monthly, Amount (EUR): ${amountEuros}`)

  const price = await getSubscriptionPrice(ctx, amountEuros);
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [
      {price: price.id}
    ],
    default_source: source.id
  });
  ctx.log(`Created a monthly subscription ${subscription.id}`)

  await handleMauticDonation(ctx, customer, {
    type: DonationType.Monthly,
    paymentMethod: source.type,
    amountCents: amountEuros / 100,
    subscription
  }).catch(err => ctx.log(`Failed mautic call`, err))
}

