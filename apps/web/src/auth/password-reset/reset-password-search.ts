import { z } from "../../libs/zod.ts";

/** `?token=` as the reset email writes it. Anything else reads as no token,
 * and the screen explains the link instead of offering a form that cannot work. */
export const resetPasswordSearchSchema = z.object({
  token: z
    .string()
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional()
    .catch(undefined),
});
