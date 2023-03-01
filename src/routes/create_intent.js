import {stripe} from "../stripe_helper.js";
import {getJoiMiddleware} from "../shared.js";
import Joi from "joi";
import {getOrCreateCustomer} from "./donate_shared.js";

export const postCreateIntent = [
  getJoiMiddleware(Joi.object({
    name: Joi.string().required().trim().min(3),
    email: Joi.string().trim().required().email(),
    amount: Joi.number().min(1).max(1000).precision(2).required(),
  })),

  async (ctx) => {
    const {amount, email, name} = ctx.request.body;
    const customer = await getOrCreateCustomer(ctx, email, name);

    ctx.log(`Creating payment intent (Email: ${email}, Amount (EUR): ${amount})`)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "eur",
      payment_method_types: ["card", "sepa_debit"],
      customer: customer.id,
    });

    ctx.log(`Created payment intent ${paymentIntent.id}`)

    ctx.body = {
      secret: paymentIntent.client_secret
    }
  }
]