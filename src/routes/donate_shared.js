import {addPriceToCache, getPricesByProduct, stripe} from "../stripe_helper.js";
import config from "../config.js";

export async function getOrCreateCustomer(ctx, email) {
  let customer = (await stripe.customers.list({
    email: email,
    limit: 1
  })).data[0];
  if (customer != null) {
    ctx.log(`Found customer for email ${email}, customer ${customer.id}`);
    return customer;
  }

  ctx.log(`No customer found for email ${email}. Creating a new one`)
  customer = await stripe.customers.create({
    email: email
  });
  ctx.log(`Created new customer ${customer.id}`)
  return customer;
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
    await addPriceToCache(productId);
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

  return price;
}

