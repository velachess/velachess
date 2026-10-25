import { api, parseResponse, type InferResponseType } from "../api/index.ts";
import { queryOptions } from "../libs/react-query.ts";

type SignInMethods = InferResponseType<typeof api.config.$get, 200>["signInMethods"];

const FALLBACK: SignInMethods = {
  password: true,
  passwordReset: false,
  google: false,
  magicLink: false,
};

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
