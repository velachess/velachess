import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@velachess/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@velachess/ui/components/sidebar";
import { ThemeRadioItems } from "@velachess/ui/components/theme-toggle";
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  PaletteIcon,
  SettingsIcon,
} from "@velachess/ui/icons";

import { useSignOut } from "../auth/sign-out/use-sign-out.ts";
import type { SessionUser } from "../auth/client.ts";
import { sessionQuery } from "../auth/session.ts";
import { UserAvatar } from "../auth/user-avatar.tsx";
import { useQuery } from "../libs/react-query.ts";

const USER_MENU_COPY = {
  open: msg`Account`,
  settings: msg`Settings`,
  appearance: msg`Appearance`,
  themeSystem: msg`System`,
  themeLight: msg`Light`,
  themeDark: msg`Dark`,
  signOut: msg`Sign out`,
  signingOut: msg`Signing out…`,
} as const;

/** Who is signed in, the way into Settings and Appearance, and the way
 * out. Reads the session query the route guard already resolved — no
 * loading state. The bottom bar's trigger is the avatar alone. */
export function UserMenu() {
  const { i18n } = useLingui();
  const { data: user } = useQuery(sessionQuery);

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={i18n._(USER_MENU_COPY.open)}
            className="rounded-full"
          />
        }
      >
        <UserAvatar user={user} size="sm" />
      </DropdownMenuTrigger>
      <UserMenuContent user={user} side="bottom" showIdentity />
    </DropdownMenu>
  );
}

/** Expanded, the trigger already names the account, so the menu does not;
 * collapsed to the avatar, the menu does. */
export function SidebarUserMenu() {
  const { i18n } = useLingui();
  const { state } = useSidebar();
  const { data: user } = useQuery(sessionQuery);

  if (!user) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" aria-label={i18n._(USER_MENU_COPY.open)} />
            }
          >
            <UserIdentity user={user} />
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <UserMenuContent
            user={user}
            side="right"
            showIdentity={state === "collapsed"}
          />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserIdentity({ user }: { user: SessionUser }) {
  return (
    <>
      <UserAvatar user={user} />
      <span className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs">{user.email}</span>
      </span>
    </>
  );
}

function UserMenuContent({
  user,
  side,
  showIdentity,
}: {
  user: SessionUser;
  side: "bottom" | "right";
  showIdentity: boolean;
}) {
  const { i18n } = useLingui();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const appearanceTriggerRef = useRef<HTMLDivElement>(null);

  async function handleSignOut() {
    await signOut.mutateAsync().catch(() => {
      // Cache is cleared by onSettled either way; navigate regardless.
    });
    await navigate({ to: "/login", replace: true });
  }

  return (
    <DropdownMenuContent side={side} align="end" className="min-w-56">
      {showIdentity && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="p-0 font-normal text-popover-foreground">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <UserIdentity user={user} />
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </>
      )}

      <DropdownMenuGroup>
        <DropdownMenuLinkItem render={<Link to="/settings/account" />}>
          <SettingsIcon />
          {i18n._(USER_MENU_COPY.settings)}
        </DropdownMenuLinkItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger ref={appearanceTriggerRef}>
            <PaletteIcon />
            {i18n._(USER_MENU_COPY.appearance)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <ThemeRadioItems
              labels={{
                system: i18n._(USER_MENU_COPY.themeSystem),
                light: i18n._(USER_MENU_COPY.themeLight),
                dark: i18n._(USER_MENU_COPY.themeDark),
              }}
              anchorRef={appearanceTriggerRef}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        variant="destructive"
        disabled={signOut.isPending}
        onClick={handleSignOut}
      >
        <LogOutIcon />
        {signOut.isPending
          ? i18n._(USER_MENU_COPY.signingOut)
          : i18n._(USER_MENU_COPY.signOut)}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
