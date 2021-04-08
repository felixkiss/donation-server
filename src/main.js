import {postDonate} from "./routes/donate.js"
import {Stripe} from "stripe";
import Koa from "koa"
import Router from "@koa/router";
import koaBody from 'koa-body';
import config from "./config.js"
import alphanumeric from "alphanumeric-id";

export const stripe = new Stripe(config["stripe"]["secretKey"], {apiVersion: "2020-08-27"});

const app = new Koa();

// Body handler
app.use(koaBody());

// Global error handling
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.body = {error: "Internal error"}
    console.error("server error", err)
  }
})

// Add helper methods
app.use(async (ctx, next) => {
  ctx.requestId = alphanumeric(6).toUpperCase();
  ctx.log = (message, ...objects) => {
    console.log(` [req/${ctx.requestId}] ${message}`, ...objects);
  }
  ctx.withError = (status, message) => {
    ctx.status = status;
    ctx.body = typeof message === "object" ? message : {error: message};
  }
  await next();
});

// CORS
if (config["server"]["corsAny"]) {
  app.use(async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', ctx.get("Origin"));
    ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    ctx.set('Access-Control-Allow-Headers', '*');
    await next();
  })
}

// Router
const appRouter = new Router();
appRouter.get("/", ctx => ctx.body = {info: "This is a donation server using stripe made with <3"})
appRouter.post("/donate", ...postDonate)

app.use(appRouter.routes());
app.use(appRouter.allowedMethods());

// HTTP Server
const port = config["server"]["port"];
const httpServer = app.listen(port);
httpServer.addListener("listening", () => {
  console.log(`Ready at port ${port}`);
});
httpServer.addListener("error", err => {
  console.error("Failed to start http server", err)
})