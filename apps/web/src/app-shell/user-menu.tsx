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
} from "@velachess/ui/components/sidebar";
import { ThemeRadioItems } from "@velachess/ui/components/theme-toggle";
import { ChevronsUpDownIcon, PaletteIcon, SettingsIcon } from "@velachess/ui/icons";

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
      <UserMenuContent user={user} side="bottom" />
    </DropdownMenu>
  );
}

/** The sidebar's trigger names the account; collapsed, only the avatar
 * shows. */
export function SidebarUserMenu() {
  const { i18n } = useLingui();
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
            <UserAvatar user={user} />
            <span className="grid flex-1 leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <UserMenuContent user={user} side="right" />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserMenuContent({
  user,
  side,
}: {
  user: SessionUser;
  side: "bottom" | "right";
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
    <DropdownMenuContent side={side} align="end" className="w-56">
      <DropdownMenuGroup>
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2">
            <UserAvatar user={user} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="text-muted-foreground truncate text-xs">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
      </DropdownMenuGroup>

      <DropdownMenuSeparator />

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
        {signOut.isPending
          ? i18n._(USER_MENU_COPY.signingOut)
          : i18n._(USER_MENU_COPY.signOut)}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
