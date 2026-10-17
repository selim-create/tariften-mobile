/**
 * TARİFTEN / LOKMA
 * A small brand-friendly semantic food and reaction language.
 *
 * Emoji are decorative; adjacent text remains the source of ingredient truth.
 * Mapping is local/deterministic: no requests, model calls, or invented food.
 * Designed as a replaceable semantic registry for future custom illustrations.
 */
export const LOKMA_REACTIONS = [
  { id: "delicious", emoji: "😋", label: "Nefis!" },
  { id: "love", emoji: "😍", label: "Bayıldım" },
  { id: "applause", emoji: "👏", label: "Eline sağlık" },
  { id: "fire", emoji: "🔥", label: "Harika olmuş" },
  { id: "heart", emoji: "🧡", label: "Favorim" },
  { id: "chef", emoji: "👩‍🍳", label: "Şef işi" },
] as const;

export const LOKMA_RATINGS = [
  { rating: 1, emoji: "😕", label: "Beğenmedim" },
  { rating: 2, emoji: "🙁", label: "Bana göre değil" },
  { rating: 3, emoji: "🙂", label: "Fena değil" },
  { rating: 4, emoji: "😋", label: "Çok lezzetli" },
  { rating: 5, emoji: "🤩", label: "Bayıldım!" },
] as const;

type FoodSymbol = { emoji: string; label: string; tint: string };
type FoodRule = FoodSymbol & { patterns: readonly string[] };

const RULES: readonly FoodRule[] = [
  { emoji: "🍅", label: "Domates", tint: "rose", patterns: ["domates", "tomato", "salça"] },
  { emoji: "🥕", label: "Havuç", tint: "orange", patterns: ["havuç", "carrot"] },
  { emoji: "🧅", label: "Soğan", tint: "sand", patterns: ["soğan", "arpacık"] },
  { emoji: "🧄", label: "Sarımsak", tint: "sand", patterns: ["sarımsak", "sarmısak", "garlic"] },
  { emoji: "🥔", label: "Patates", tint: "sand", patterns: ["patates", "potato"] },
  { emoji: "🍋", label: "Limon", tint: "yellow", patterns: ["limon", "lime", "misket limonu"] },
  { emoji: "🍊", label: "Portakal", tint: "orange", patterns: ["portakal", "mandalina"] },
  { emoji: "🍓", label: "Çilek", tint: "rose", patterns: ["çilek", "strawberry"] },
  { emoji: "🍒", label: "Kiraz", tint: "rose", patterns: ["kiraz", "vişne"] },
  { emoji: "🫐", label: "Yaban mersini", tint: "lavender", patterns: ["yaban mersini", "blueberry", "böğürtlen"] },
  { emoji: "🍎", label: "Elma", tint: "rose", patterns: ["elma", "apple"] },
  { emoji: "🍐", label: "Armut", tint: "sage", patterns: ["armut", "pear"] },
  { emoji: "🍌", label: "Muz", tint: "yellow", patterns: ["muz", "banana"] },
  { emoji: "🍇", label: "Üzüm", tint: "lavender", patterns: ["üzüm", "grape"] },
  { emoji: "🍉", label: "Karpuz", tint: "rose", patterns: ["karpuz", "watermelon"] },
  { emoji: "🍑", label: "Şeftali", tint: "orange", patterns: ["şeftali", "nektarin"] },
  { emoji: "🥝", label: "Kivi", tint: "sage", patterns: ["kivi", "kiwi"] },
  { emoji: "🍍", label: "Ananas", tint: "yellow", patterns: ["ananas", "pineapple"] },
  { emoji: "🥑", label: "Avokado", tint: "sage", patterns: ["avokado", "avocado"] },
  { emoji: "🌰", label: "Kuruyemiş", tint: "sand", patterns: ["badem", "fındık", "ceviz", "kestane", "pecan"] },
  { emoji: "🥜", label: "Yer fıstığı", tint: "sand", patterns: ["yer fıstığı", "fıstık ezmesi", "peanut"] },
  { emoji: "🧀", label: "Peynir", tint: "yellow", patterns: ["parmesan", "peynir", "mozzarella", "kaşar", "feta", "ricotta"] },
  { emoji: "🥚", label: "Yumurta", tint: "sand", patterns: ["yumurta", "egg"] },
  { emoji: "🥛", label: "Süt", tint: "blue", patterns: ["süt", "milk", "krema", "kaymak"] },
  { emoji: "🧈", label: "Tereyağı", tint: "yellow", patterns: ["tereyağı", "margarin", "butter"] },
  { emoji: "🫒", label: "Zeytin", tint: "sage", patterns: ["zeytinyağı", "zeytin", "olive"] },
  { emoji: "🌿", label: "Taze otlar", tint: "sage", patterns: ["fesleğen", "maydanoz", "dereotu", "nane", "kekik", "biberiye", "kişniş", "roka", "taze ot", "defne"] },
  { emoji: "🧂", label: "Baharat", tint: "sand", patterns: ["karabiber", "tuz", "kimyon", "zerdeçal", "tarçın", "köri", "sumak", "pul biber", "yenibahar", "muskat", "safran"] },
  { emoji: "🌶️", label: "Biber", tint: "rose", patterns: ["biber", "chili", "jalapeño", "paprika"] },
  { emoji: "🍆", label: "Patlıcan", tint: "lavender", patterns: ["patlıcan", "aubergine"] },
  { emoji: "🥒", label: "Salatalık", tint: "sage", patterns: ["salatalık", "kornişon", "kabak", "zucchini"] },
  { emoji: "🥬", label: "Yeşillik", tint: "sage", patterns: ["marul", "ıspanak", "lahana", "pazı", "brokoli", "kale"] },
  { emoji: "🥦", label: "Brokoli", tint: "sage", patterns: ["brokoli", "broccoli"] },
  { emoji: "🍄", label: "Mantar", tint: "sand", patterns: ["mantar", "shiitake", "istiridye mantarı"] },
  { emoji: "🫘", label: "Bakliyat", tint: "sand", patterns: ["fasulye", "nohut", "mercimek", "barbunya", "börülce", "bezelye"] },
  { emoji: "🌽", label: "Mısır", tint: "yellow", patterns: ["mısır", "corn"] },
  { emoji: "🍚", label: "Pirinç", tint: "sand", patterns: ["pirinç", "bulgur", "quinoa", "kinoa", "kus kus"] },
  { emoji: "🍝", label: "Makarna", tint: "orange", patterns: ["gnocchi", "makarna", "spagetti", "penne", "erişte", "noodle", "lazanya"] },
  { emoji: "🍞", label: "Ekmek", tint: "sand", patterns: ["ekmek", "un", "galeta", "hamur", "lavaş", "panko"] },
  { emoji: "🍗", label: "Tavuk", tint: "orange", patterns: ["tavuk", "hindi", "chicken"] },
  { emoji: "🥩", label: "Et", tint: "rose", patterns: ["dana", "kuzu", "kıyma", "antrikot", "bonfile", "biftek"] },
  { emoji: "🐟", label: "Balık", tint: "blue", patterns: ["balık", "somon", "levrek", "çipura", "ton balığı", "hamsi"] },
  { emoji: "🍤", label: "Karides", tint: "rose", patterns: ["karides", "shrimp"] },
  { emoji: "🍯", label: "Bal", tint: "yellow", patterns: ["bal", "pekmez", "agave"] },
  { emoji: "🍫", label: "Çikolata", tint: "sand", patterns: ["çikolata", "kakao"] },
  { emoji: "🍬", label: "Şeker", tint: "rose", patterns: ["şeker", "pudra şekeri"] },
  { emoji: "☕", label: "Kahve", tint: "sand", patterns: ["kahve", "espresso", "nescafe"] },
  { emoji: "🍵", label: "Çay", tint: "sage", patterns: ["çay", "matcha"] },
  { emoji: "🫗", label: "Sıvı", tint: "blue", patterns: ["su", "sirke", "soda", "maden suyu"] },
];

const BACKGROUND: Record<string, string> = {
  rose: "bg-[#fff0eb] ring-[#fae0db]",
  orange: "bg-[#fff1e6] ring-[#f5e1ca]",
  sand: "bg-[#f7f1e6] ring-[#eee4d5]",
  yellow: "bg-[#fff7da] ring-[#f3eccb]",
  sage: "bg-[#edf6ea] ring-[#dfecdb]",
  blue: "bg-[#ecf5f8] ring-[#dcebf1]",
  lavender: "bg-[#f5eefb] ring-[#e8ddf0]",
};

export function lokmaIngredient(name: string): FoodSymbol {
  const text = name.toLocaleLowerCase("tr-TR").normalize("NFC").replace(/[()\[\],.;:]/g, " ").trim();
  const words = ` ${text.replace(/\s+/g, " ")} `;
  for (const rule of RULES) {
    if (rule.patterns.some(p => words.includes(` ${p} `))) {
      return { emoji: rule.emoji, label: rule.label, tint: rule.tint };
    }
  }
  return { emoji: "🍽️", label: "Malzeme", tint: "sand" };
}

export function lokmaIngredientClasses(tint: string): string {
  return BACKGROUND[tint] || BACKGROUND.sand;
}
