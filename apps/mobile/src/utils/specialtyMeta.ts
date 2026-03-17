import { Ionicons } from "@expo/vector-icons";

const SPECIALTY_COLORS: Record<string, string> = {
  Anatomi: "#BF5F3E",
  Farmakoloji: "#2E9E57",
  Mikrobiyoloji: "#4A90D9",
  Fizyoloji: "#9B59B6",
  Biyokimya: "#E67E22",
  Histoloji: "#E74C8B",
  Patoloji: "#8E44AD",
};

const SPECIALTY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Anatomi: "body-outline",
  Farmakoloji: "flask-outline",
  Mikrobiyoloji: "bug-outline",
  Fizyoloji: "pulse-outline",
  Biyokimya: "beaker-outline",
  Histoloji: "cellular-outline",
  Patoloji: "medkit-outline",
};

export function getSpecialtyColor(title: string): string {
  for (const key of Object.keys(SPECIALTY_COLORS)) {
    if (title.includes(key)) return SPECIALTY_COLORS[key];
  }
  return "#BD9465";
}

export function getSpecialtyIcon(title: string): keyof typeof Ionicons.glyphMap {
  for (const key of Object.keys(SPECIALTY_ICONS)) {
    if (title.includes(key)) return SPECIALTY_ICONS[key];
  }
  return "book-outline";
}
