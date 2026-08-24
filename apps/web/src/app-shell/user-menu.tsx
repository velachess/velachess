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
import { SettingsIcon } from "@velachess/ui/icons";

import { useSignOut } from "../auth/sign-out/use-sign-out.ts";
import { sessionQuery } from "../auth/session.ts";
import { UserAvatar } from "../auth/user-avatar.tsx";
import { useQuery } from "../shared/libs/query/index.ts";

const USER_MENU_COPY = {
  open: msg`Account`,
  settings: msg`Settings`,
  signOut: msg`Sign out`,
  signingOut: msg`Signing out…`,
} as const;

/**
 * The account entry point in the shell: who is signed in, the way into
 * Settings, and the way out.
 *
 * Managing the account happens behind the Settings link, not in here — a
 * popover you can rename yourself in is a popover you rename yourself in
 * by accident. What stays is what has to be one click: signing out.
 *
 * Reads the same session query the route guard already resolved, so there
 * is no loading state to render.
 */
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
          <Button
            variant="ghost"
            size="icon"
            aria-label={i18n._(USER_MENU_COPY.open)}
            className="rounded-full"
          />
        }
      >
        {/* The person's own picture is the affordance. A generic user
            glyph reads as "account" to whoever built the page and as
            nothing in particular to whoever is looking for themselves. */}
        <UserAvatar user={user} size="sm" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-56">
        <div className="flex items-center gap-2">
          <UserAvatar user={user} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="text-muted-foreground truncate text-xs">{user.email}</span>
          </div>
        </div>

        <Separator className="my-3" />

        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={async () => {
            await navigate({ to: "/settings/account" });
          }}
        >
          <SettingsIcon />
          {i18n._(USER_MENU_COPY.settings)}
        </Button>

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
