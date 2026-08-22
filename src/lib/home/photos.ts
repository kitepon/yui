import type { DayPeriod } from "./clock";

export const PHOTO = {
  house: "/images/house.jpg",
  living: "/images/living.jpg",
  bedroom: "/images/bedroom.jpg",
} as const;

export const HOUSE_BY_PERIOD: Record<DayPeriod, string> = {
  late: "/images/house-late.jpg",
  dawn: "/images/house-dawn.jpg",
  morning: "/images/house-morning.jpg",
  day: "/images/house-day.jpg",
  evening: "/images/house.jpg",
  night: "/images/house-night.jpg",
};

export function roomPhoto(room: string) {
  if (room.includes("寝室")) return PHOTO.bedroom;
  if (room.includes("リビング") || room.includes("居間")) return PHOTO.living;
  return undefined;
}

export function headerPhoto(room: string, period: DayPeriod = "evening") {
  return roomPhoto(room) ?? HOUSE_BY_PERIOD[period];
}

export function headerTitle(room: string) {
  return room === "すべて" ? "結" : room;
}

export function headerPosition(room: string) {
  if (room.includes("寝室")) return "50% 58%";
  if (room.includes("リビング") || room.includes("居間")) return "42% 72%";
  return "50% 62%";
}
