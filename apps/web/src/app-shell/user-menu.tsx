import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@velachess/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@velachess/ui/components/popover";
import { Separator } from "@velachess/ui/components/separator";
import { UserRoundIcon } from "@velachess/ui/icons";

import { useSignOut } from "../auth/sign-out/use-sign-out.ts";
import { sessionQuery } from "../auth/session.ts";
import { useQuery } from "../shared/libs/query/index.ts";

const USER_MENU_COPY = {
  open: msg`Account`,
  signOut: msg`Sign out`,
  signingOut: msg`Signing out…`,
} as const;

/** Reads the same session query the route guard already resolved — no loading state needed here. */
export function UserMenu() {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const { data: user } = useQuery(sessionQuery);
  const signOut = useSignOut();

  if (!user) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={i18n._(USER_MENU_COPY.open)} />
        }
      >
        <UserRoundIcon />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-56">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{user.name}</span>
          <span className="text-muted-foreground truncate text-xs">{user.email}</span>
        </div>

        <Separator className="my-3" />

        <Button
          variant="outline"
          className="w-full"
          disabled={signOut.isPending}
          onClick={async () => {
            await signOut.mutateAsync().catch(() => {
              // Cache is cleared by onSettled either way; navigate regardless.
            });
            await navigate({ to: "/login", replace: true });
          }}
        >
          {signOut.isPending
            ? i18n._(USER_MENU_COPY.signingOut)
            : i18n._(USER_MENU_COPY.signOut)}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
