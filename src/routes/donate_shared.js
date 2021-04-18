import {stripe} from "../main";
import config from "../config";

export async function getOrCreateCustomer(email) {
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

export async function getOrCreatePrice(amount, type) {
  let price = await getPredefiendPrice(amount, type);
  if (price != null) {
    return price;
  }

  price = await stripe.prices.create({
    currency: "eur",
    unit_amount: amount * 100,
    product: config["stripe"]["monthlyProductId"],
    recurring: {
      interval: "month"
    }
  });
  ctx.log(`No pre-defined price found. Created new price ${price.id}`)
  return price;
}

async function getPredefiendPrice(amount, type) {
  const price = (config["stripe"]["predefinedPrices"] ?? [])
    .find(price => price.amount === amount && price.interval === type);
  return price != null ? stripe.prices.retrieve(price.id) : null;
}