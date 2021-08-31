import MauticConnector from "node-mautic";
import config from "./config.js";
import {splitStripeName} from "./stripe_helper.js";
import dayjs from "dayjs";
import {DonationType} from "./routes/donate_shared.js";

const mauticConnector = new MauticConnector({
  apiUrl: config["mautic"]["url"],
  username: config["mautic"]["username"],
  password: config["mautic"]["password"],
  timeoutInSeconds: 5
});

/*
TODO webhook integration (pay subscription, cancel subscription)
 */

export async function handleMauticDonation(ctx, stripeCustomer, donation) {
  const contact = await getOrCreateContact(stripeCustomer, ctx.ip);
  const contactFields = contact["fields"]["all"];

  ctx.log(`Found mautic contact id=${contact["id"]} name="${contactFields["firstname"]} ${contactFields["lastname"]}"`)

  await mauticConnector.contacts.editContact("PATCH", {
    ipAddress: ctx.ip,
    //totalDonationAmount: (contactFields["totalDonationAmount"] ?? 0) + amount,
    lastdonation: dayjs().format("DD.MM.YYYY HH:mm:ss Z")
  }, contact["id"]);

  if (donation.type === DonationType.OneTime) {
    await addNote(contact,
      `Donated ${donation.amount / 100} euros using ${donation.source.type} ` +
      `(chargeId=${donation.charge.id})`)
  } else if (donation.type === DonationType.Monthly) {
    await addNote(contact,
      `Subscribed for ${donation.amount / 100} euros using ${donation.source.type} `
      + `(subscriptionId=${donation.subscription.id})`)
  }

  ctx.log(`Updated mautic contact`)
}

async function addNote(contact, message) {
  await mauticConnector.notes.createNote({
    lead: contact["id"],
    type: "general",
    text: message
  })
}

async function searchContact(expression) {
  const searchResult = await mauticConnector.contacts.listContacts({
    search: "!is:anonymous " + expression,
    limit: 2
  });
  const contacts = Object.values(searchResult["contacts"]);

  // This intentionally returns null if there are multiple results. We only want unique matches.
  return contacts.length === 1 ? contacts[0] : null;
}

async function getOrCreateContact(stripeCustomer, ipAddress) {
  const byStripeId = await searchContact(`stripecustomerid:"${stripeCustomer.id}"`);
  if (byStripeId != null) {
    return byStripeId;
  }

  const byEmail = await searchContact(`email:"${stripeCustomer.email}"`);
  if (byEmail != null) {
    return byEmail;
  }

  let createRequest = {
    email: stripeCustomer.email,
    ipAddress,
    stripecustomerid: stripeCustomer.id,
    hasdonated: true
  };

  const customerNames = splitStripeName(stripeCustomer);
  if (customerNames != null) {
    createRequest["firstname"] = customerNames.firstName
    createRequest["lastname"] = customerNames.lastName;
  }

  return (await mauticConnector.contacts.createContact(createRequest))["contact"];
}