import { z } from "zod";

/** Parse and return a typed body; ZodError is turned into 422 by errorHandler. */
export function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  return schema.parse(body);
}
