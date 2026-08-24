/**
 * The signed-in person, as a picture.
 *
 * One component, because the shell's menu and the account screen must not
 * disagree about what someone looks like — and because the fallback is the
 * interesting part: an account created with email and password has no
 * `image` at all, so initials are the normal case, not the error case.
 */

import { Avatar, AvatarFallback, AvatarImage } from "@velachess/ui/components/avatar";

import type { SessionUser } from "./client.ts";

/**
 * At most two letters, from the first and last word of the name.
 *
 * Falls back to the email's first character, then to nothing — a name is
 * required by Better Auth, but a name of `" "` is not, and an avatar that
 * throws is worse than one that is briefly blank.
 */
function initialsOf(user: Pick<SessionUser, "name" | "email">): string {
  const words = user.name.trim().split(/\s+/).filter(Boolean);
  const letters = [words[0], words.length > 1 ? words.at(-1) : undefined]
    .filter((word): word is string => Boolean(word))
    .map((word) => [...word][0]!)
    .join("");

  return (letters || [...user.email][0] || "").toUpperCase();
}

export function UserAvatar({
  user,
  size = "default",
  className,
}: {
  user: Pick<SessionUser, "name" | "email" | "image">;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} {...(className ? { className } : {})}>
      {/* The provider's URL, straight from the session. It is remote and
          may 404 — Avatar's own fallback covers that without this
          component having to know. Decorative: every place this appears,
          the name is written next to it. */}
      {user.image ? <AvatarImage src={user.image} alt="" /> : null}
      <AvatarFallback>{initialsOf(user)}</AvatarFallback>
    </Avatar>
  );
}
