import rateLimit from "express-rate-limit";

const json = { error: "Too many requests — please slow down and try again shortly." };

/** Brute-force guard for the login / Google endpoints. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json,
});

/** Stop a single device from flooding the kitchen with orders. */
export const orderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 min
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json,
});
