import type { CSSProperties } from "react";
import spotify from "../../assets/platforms/spotify.svg";
import soundcloud from "../../assets/platforms/soundcloud.svg";
import instagram from "../../assets/platforms/instagram.svg";
import facebook from "../../assets/platforms/facebook.svg";
import youtube from "../../assets/platforms/youtube.svg";
import tiktok from "../../assets/platforms/tiktok.svg";
import discord from "../../assets/platforms/discord.svg";

const icons: Record<string, string> = { Spotify: spotify, SoundCloud: soundcloud, Instagram: instagram, Facebook: facebook, YouTube: youtube, TikTok: tiktok, Discord: discord };

export function PlatformIcon({ name }: { name: string }) {
  const icon = icons[name];
  return <span aria-hidden="true" className={`platform-brand platform-brand-${name.toLowerCase()}`} style={icon ? { "--platform-icon": `url("${icon}")` } as CSSProperties : undefined}>{icon ? null : "D"}</span>;
}
