import {
  Clapperboard,
  Compass,
  MapIcon,
  MessageCircle,
  UserRound,
} from "lucide-react";

/**
 * The app's five destinations, shared by the phone bottom tabs and the
 * desktop side rail so the two navs can never drift apart.
 */
export const NAV_ITEMS = [
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/quests", label: "Quests", icon: Compass },
  { href: "/reels", label: "Reels", icon: Clapperboard },
  { href: "/profile", label: "You", icon: UserRound },
] as const;
