import { api, parseResponse } from "../api/index.ts";
import { queryOptions } from "../libs/react-query.ts";

export interface SignInMethods {
  password: boolean;
  google: boolean;
  passwordReset: boolean;
}

const FALLBACK: SignInMethods = { password: true, google: false, passwordReset: false };

export const signInMethodsQuery = queryOptions({
  queryKey: ["auth", "sign-in-methods"] as const,
  queryFn: async (): Promise<SignInMethods> => {
    try {
      const { signInMethods } = await parseResponse(api.config.$get());
      return signInMethods;
    } catch {
      return FALLBACK;
    }
  },
  staleTime: Infinity,
});
