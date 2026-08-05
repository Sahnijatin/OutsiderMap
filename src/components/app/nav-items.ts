import {
  BookOpen,
  Compass,
  MapIcon,
  MessageCircle,
  Newspaper,
  UserRound,
} from "lucide-react";

/**
 * The app's six destinations, shared by the phone bottom tabs and the desktop
 * side rail so the two navs can never drift apart.
 */
export const NAV_ITEMS = [
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/quests", label: "Quests", icon: Compass },
  { href: "/feed", label: "Feed", icon: Newspaper },
  // Writing about a place is its own destination, not something buried behind
  // the feed's composer - a member should be able to reach it in one tap.
  { href: "/blog", label: "Blog", icon: BookOpen },
  { href: "/profile", label: "You", icon: UserRound },
] as const;
