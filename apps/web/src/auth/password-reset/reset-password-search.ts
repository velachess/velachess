import { z } from "../../libs/zod.ts";

export const resetPasswordSearchSchema = z.object({
  token: z
    .string()
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional()
    .catch(undefined),
});
