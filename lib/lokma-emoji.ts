/**
 * TARİFTEN / LOKMA
 * A small brand-friendly semantic food and reaction language.
 *
 * Emoji are decorative; adjacent text remains the source of ingredient truth.
 * Mapping is local/deterministic: no requests, model calls, or invented food.
 * Uses the identical Web semantic rules and editorial art IDs, rendered as native offline vector miniatures (synced from tariften-web).
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

type FoodSymbol = { emoji: string; label: string; tint: string; art?: string };
type FoodRule = FoodSymbol & { patterns: readonly string[] };

const RULES: readonly FoodRule[] = [
  // Ingredient-specific miniature art stays independent of platform-native emojis.
  // More specific names precede broad categories, without modifying the user's text.
  // Wave 2 (Lokma): specific everyday Turkish pantry items before broad families.
  { emoji: "🥬", art: "spinach", label: "Ispanak", tint: "sage", patterns: ["ıspanak", "ispanak", "pazı", "semizotu", "bebek ıspanak"] },
  { emoji: "🌿", art: "greenonion", label: "Taze soğan", tint: "sage", patterns: ["taze soğan", "yeşil soğan", "frenk soğanı"] },
  { emoji: "🌿", art: "mint", label: "Nane", tint: "sage", patterns: ["nane", "kuru nane", "taze nane"] },
  { emoji: "🌿", art: "thyme", label: "Kekik", tint: "sage", patterns: ["kekik", "kuru kekik", "taze kekik"] },
  { emoji: "🌿", art: "rosemary", label: "Biberiye", tint: "sage", patterns: ["biberiye"] },
  { emoji: "🌿", art: "bayleaf", label: "Defne", tint: "sage", patterns: ["defne", "defne yaprağı"] },
  { emoji: "🧂", art: "ginger", label: "Zencefil", tint: "sand", patterns: ["zencefil", "taze zencefil", "toz zencefil"] },
  { emoji: "🍯", art: "pomsauce", label: "Nar ekşisi", tint: "rose", patterns: ["nar ekşisi"] },
  { emoji: "🍎", art: "pomegranate", label: "Nar", tint: "rose", patterns: ["nar", "nar taneleri"] },
  { emoji: "🍇", art: "fig", label: "İncir", tint: "lavender", patterns: ["incir", "kuru incir"] },
  { emoji: "🍑", art: "apricot", label: "Kayısı", tint: "orange", patterns: ["kayısı", "kuru kayısı", "zerdali"] },
  { emoji: "🍇", art: "plum", label: "Erik", tint: "lavender", patterns: ["erik", "mürdüm eriği", "can eriği"] },
  { emoji: "🌰", art: "date", label: "Hurma", tint: "sand", patterns: ["hurma", "medjool hurma"] },
  { emoji: "🍐", art: "quince", label: "Ayva", tint: "yellow", patterns: ["ayva"] },
  { emoji: "🌰", art: "pistachio", label: "Antep fıstığı", tint: "sage", patterns: ["antep fıstığı", "fıstık", "şam fıstığı"] },
  { emoji: "🌰", art: "coconut", label: "Hindistan cevizi", tint: "sand", patterns: ["hindistan cevizi", "hindistancevizi"] },
  { emoji: "🫘", art: "chickpea", label: "Nohut", tint: "sand", patterns: ["nohut", "haşlanmış nohut"] },
  { emoji: "🍚", art: "bulgur", label: "Bulgur", tint: "sand", patterns: ["bulgur", "pilavlık bulgur", "köftelik bulgur"] },
  { emoji: "🍚", art: "oats", label: "Yulaf", tint: "sand", patterns: ["yulaf", "yulaf ezmesi", "yulaf unu"] },
  { emoji: "🧂", art: "turmeric", label: "Zerdeçal", tint: "yellow", patterns: ["zerdeçal", "toz zerdeçal", "köri", "köri tozu"] },
  { emoji: "🧂", art: "sumac", label: "Sumak", tint: "rose", patterns: ["sumak"] },
  { emoji: "🧂", art: "chiliflakes", label: "Pul biber", tint: "rose", patterns: ["pul biber", "isot", "acı pul biber", "urfa biberi"] },
  { emoji: "🍫", art: "cocoa", label: "Kakao", tint: "sand", patterns: ["kakao", "kakao tozu"] },
  { emoji: "🍬", art: "brownsugar", label: "Esmer şeker", tint: "sand", patterns: ["esmer şeker"] },
  { emoji: "🥩", art: "mince", label: "Kıyma", tint: "rose", patterns: ["kıyma", "dana kıyma", "kuzu kıyma", "köftelik kıyma", "yağlı kıyma"] },
  { emoji: "🥩", art: "lamb", label: "Kuzu eti", tint: "rose", patterns: ["kuzu", "kuzu eti", "pirzola", "kuzu pirzola", "kuzu but"] },
  { emoji: "🐟", art: "tuna", label: "Ton balığı", tint: "blue", patterns: ["ton balığı", "konserve ton balığı"] },
  { emoji: "🐟", art: "salmon", label: "Somon", tint: "orange", patterns: ["somon", "somon fileto", "füme somon"] },
  { emoji: "🐟", art: "mussel", label: "Midye", tint: "blue", patterns: ["midye", "midye içi"] },
  { emoji: "🧀", art: "whitecheese", label: "Beyaz peynir", tint: "sand", patterns: ["beyaz peynir", "feta", "feta peyniri", "lor", "lor peyniri", "ezine peyniri", "tulum peyniri", "keçi peyniri"] },
  { emoji: "🧀", art: "creamcheese", label: "Krem peynir", tint: "blue", patterns: ["labne", "labne peyniri", "krem peynir", "mascarpone"] },
  { emoji: "🥛", art: "cream", label: "Krema", tint: "blue", patterns: ["krema", "sıvı krema", "krem şanti", "kaymak", "süt kreması", "çiğ krema"] },
  { emoji: "🫗", art: "vinegar", label: "Sirke", tint: "yellow", patterns: ["sirke", "üzüm sirkesi", "elma sirkesi", "balzamik sirke", "balzamik"] },
  { emoji: "🍯", art: "soysauce", label: "Soya sosu", tint: "sand", patterns: ["soya sosu", "soya sos"] },
  { emoji: "🍯", art: "molasses", label: "Pekmez", tint: "sand", patterns: ["pekmez", "üzüm pekmezi", "harnup pekmezi", "dut pekmezi"] },
  { emoji: "🍯", art: "mustard", label: "Hardal", tint: "yellow", patterns: ["hardal", "dijon hardal"] },
  { emoji: "🍯", art: "ketchup", label: "Ketçap", tint: "rose", patterns: ["ketçap", "ketcap"] },
  { emoji: "🍯", art: "mayonnaise", label: "Mayonez", tint: "yellow", patterns: ["mayonez"] },
  { emoji: "🍞", art: "yeast", label: "Maya", tint: "sand", patterns: ["maya", "kuru maya", "instant maya", "yaş maya"] },
  { emoji: "🥒", art: "pickle", label: "Turşu", tint: "sage", patterns: ["turşu", "kornişon", "kornişon turşu"] },
  { emoji: "🍞", art: "flatbread", label: "Lavaş", tint: "sand", patterns: ["lavaş", "yufka", "tortilla", "bazlama", "pide"] },
  { emoji: "🧂", art: "paprikaspice", label: "Toz kırmızı biber", tint: "rose", patterns: ["kırmızı biber baharat", "kırmızı biber tozu", "kırmızı toz biber", "toz kırmızı biber", "tatlı toz biber", "acı toz biber", "paprika"] },
  { emoji: "🫘", art: "greenlentil", label: "Yeşil mercimek", tint: "sage", patterns: ["yeşil mercimek", "yesil mercimek"] },
  { emoji: "🫘", art: "redlentil", label: "Kırmızı mercimek", tint: "orange", patterns: ["kırmızı mercimek", "kirmizi mercimek"] },
  { emoji: "🌶️", art: "bellpepper", label: "Dolmalık biber", tint: "sage", patterns: ["dolmalık biber", "dolma biber", "dolmalik biber"] },
  { emoji: "🌶️", art: "kapiapepper", label: "Kapya biber", tint: "rose", patterns: ["kapya", "kapya biber"] },
  { emoji: "🌶️", art: "redpepper", label: "Kırmızı biber", tint: "rose", patterns: ["kırmızı biber", "kirmizi biber"] },
  { emoji: "🌶️", art: "carliston", label: "Çarliston biber", tint: "sage", patterns: ["çarliston", "carliston", "çarliston biber"] },
  { emoji: "🌶️", art: "sivri", label: "Sivri biber", tint: "sage", patterns: ["sivri biber", "sivri"] },
  { emoji: "🌶️", art: "sweetpepper", label: "Biber", tint: "sage", patterns: ["yeşil biber", "yesil biber"] },
  { emoji: "🧂", art: "blackpepper", label: "Karabiber", tint: "sand", patterns: ["karabiber", "kara biber", "tane karabiber", "black pepper"] },
  { emoji: "🧂", art: "salt", label: "Tuz", tint: "sand", patterns: ["tuz", "kaya tuzu", "deniz tuzu", "iri tuz"] },
  { emoji: "🧂", art: "cumin", label: "Kimyon", tint: "sand", patterns: ["kimyon", "cumin"] },
  { emoji: "🧂", art: "cinnamon", label: "Çubuk tarçın", tint: "sand", patterns: ["çubuk tarçın", "tarçın çubuğu", "cinnamon stick"] },
  { emoji: "🌿", art: "vanilla", label: "Vanilya çubuğu", tint: "sand", patterns: ["vanilya çubuğu", "vanilya çubukları", "vanilla pod"] },
  { emoji: "🌿", art: "dill", label: "Dereotu", tint: "sage", patterns: ["dereotu", "dere otu"] },
  { emoji: "🌿", art: "arugula", label: "Roka", tint: "sage", patterns: ["roka", "arugula"] },
  { emoji: "🌰", art: "walnut", label: "Ceviz", tint: "sand", patterns: ["ceviz", "walnut"] },
  { emoji: "🌰", art: "almond", label: "Badem", tint: "sand", patterns: ["badem", "almond"] },
  { emoji: "🥬", art: "cabbage", label: "Lahana", tint: "sage", patterns: ["lahana", "beyaz lahana", "kırmızı lahana", "mor lahana"] },
  { emoji: "🍉", art: "melon", label: "Kavun", tint: "yellow", patterns: ["kavun", "melon"] },
  { emoji: "🫒", art: "oliveoil", label: "Zeytinyağı", tint: "yellow", patterns: ["zeytinyağı", "zeytin yağı", "zeytin yagı", "sızma zeytinyağı", "sızma zeytin yağı", "olive oil"] },
  { emoji: "🍎", art: "greenapple", label: "Yeşil elma", tint: "sage", patterns: ["yeşil elma", "yesil elma", "granny smith"] },
  { emoji: "🥬", art: "leek", label: "Pırasa", tint: "sage", patterns: ["pırasa", "pirasa", "leek"] },
  { emoji: "🥬", art: "celery", label: "Kereviz", tint: "sage", patterns: ["kereviz", "kereviz sapı", "celery"] },
  { emoji: "🥦", art: "cauliflower", label: "Karnabahar", tint: "sand", patterns: ["karnabahar", "cauliflower"] },
  { emoji: "🥬", art: "artichoke", label: "Enginar", tint: "sage", patterns: ["enginar", "artichoke"] },
  { emoji: "🥕", art: "radish", label: "Turp", tint: "rose", patterns: ["turp", "radish"] },
  { emoji: "🥕", art: "beet", label: "Pancar", tint: "rose", patterns: ["pancar", "beetroot"] },
  { emoji: "🎃", art: "pumpkin", label: "Bal kabağı", tint: "orange", patterns: ["bal kabağı", "balkabağı", "pumpkin"] },
  { emoji: "🥬", art: "asparagus", label: "Kuşkonmaz", tint: "sage", patterns: ["kuşkonmaz", "asparagus"] },
  { emoji: "🥒", art: "okra", label: "Bamya", tint: "sage", patterns: ["bamya", "okra"] },
  { emoji: "🥒", art: "zucchini", label: "Kabak", tint: "sage", patterns: ["kabak", "sakız kabağı", "zucchini"] },
  { emoji: "🫘", art: "pea", label: "Bezelye", tint: "sage", patterns: ["bezelye", "peas"] },
  { emoji: "🫘", art: "greenbean", label: "Taze fasulye", tint: "sage", patterns: ["taze fasulye", "yeşil fasulye", "çalı fasulyesi", "sırık fasulyesi"] },
  { emoji: "🥛", art: "yogurt", label: "Yoğurt", tint: "blue", patterns: ["yoğurt", "yogurt", "süzme yoğurt"] },
  { emoji: "🫒", art: "oil", label: "Sıvı yağ", tint: "yellow", patterns: ["ayçiçek yağı", "ayçiçek yagı", "sıvı yağ", "sivi yag", "kanola yağı", "mısırözü yağı", "bitkisel yağ", "susam yağı"] },
  { emoji: "🍞", art: "flour", label: "Un", tint: "sand", patterns: ["un", "buğday unu", "mısır unu", "tam buğday unu", "nişasta", "mısır nişastası"] },
  { emoji: "🍞", art: "baking", label: "Kabartma malzemesi", tint: "sand", patterns: ["kabartma tozu", "vanilin", "vanilya şekeri", "karbonat"] },
  { emoji: "🌰", art: "sesame", label: "Tohum", tint: "sand", patterns: ["susam", "çörek otu", "chia tohumu", "keten tohumu", "haşhaş"] },
  { emoji: "🍯", art: "sauce", label: "Sos", tint: "sand", patterns: ["tahin", "worcestershire"] },
  { emoji: "🍅", art: "paste", label: "Salça", tint: "rose", patterns: ["domates salçası", "biber salçası", "salça"] },
  { emoji: "🍅", label: "Domates", tint: "rose", patterns: ["domates", "domatesi", "domatesin", "domatas", "domatez", "tomato", "domates salçası"] },
  { emoji: "🥕", label: "Havuç", tint: "orange", patterns: ["havuç", "carrot"] },
  { emoji: "🧅", label: "Soğan", tint: "sand", patterns: ["soğan", "soğanı", "sogan", "arpacık"] },
  { emoji: "🧄", label: "Sarımsak", tint: "sand", patterns: ["sarımsak", "sarmısak", "sarimsak", "garlic"] },
  { emoji: "🥔", label: "Patates", tint: "sand", patterns: ["patates", "potato"] },
  { emoji: "🍋", label: "Limon", tint: "yellow", patterns: ["limon", "lime", "misket limonu", "limon suyu", "limon kabuğu"] },
  { emoji: "🍊", label: "Portakal", tint: "orange", patterns: ["portakal", "mandalina", "portakal suyu"] },
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
  { emoji: "🌰", label: "Kuruyemiş", tint: "sand", patterns: ["badem", "fındık", "ceviz", "kestane", "pecan", "kaju"] },
  { emoji: "🥜", label: "Yer fıstığı", tint: "sand", patterns: ["yer fıstığı", "fıstık ezmesi", "peanut"] },
  { emoji: "🧀", label: "Peynir", tint: "yellow", patterns: ["parmesan", "peynir", "mozzarella", "kaşar", "ricotta"] },
  { emoji: "🥚", label: "Yumurta", tint: "sand", patterns: ["yumurta", "egg", "menemen", "omlet", "çılbır"] },
  { emoji: "🥛", label: "Süt", tint: "blue", patterns: ["süt", "milk"] },
  { emoji: "🧈", label: "Tereyağı", tint: "yellow", patterns: ["tereyağı", "tereyagi", "margarin", "butter"] },
  { emoji: "🫒", label: "Zeytin", tint: "sage", patterns: ["zeytinyağı", "zeytin yağı", "zeytin yagı", "zeytin", "olive"] },
  { emoji: "🌿", label: "Taze otlar", tint: "sage", patterns: ["fesleğen", "maydanoz", "dereotu", "kişniş", "roka", "taze ot", "tere", "reyhan", "tarhun"] },
  { emoji: "🧂", label: "Baharat", tint: "sand", patterns: ["karabiber", "tuz", "deniz tuzu", "kaya tuzu", "kimyon", "tarçın", "yenibahar", "muskat", "safran", "karanfil", "kakule", "kırmızı toz biber"] },
  { emoji: "🌶️", art: "pepper", label: "Acı biber", tint: "rose", patterns: ["acı biber", "aci biber", "chili", "jalapeño"] },
  { emoji: "🌶️", art: "sweetpepper", label: "Biber", tint: "sage", patterns: ["biber"] },
  { emoji: "🍆", label: "Patlıcan", tint: "lavender", patterns: ["patlıcan", "aubergine", "karnıyarık", "imam bayıldı", "musakka"] },
  { emoji: "🥒", label: "Salatalık", tint: "sage", patterns: ["salatalık", "kabak", "zucchini"] },
  { emoji: "🥬", label: "Yeşillik", tint: "sage", patterns: ["marul", "lahana", "kale"] },
  { emoji: "🥦", label: "Brokoli", tint: "sage", patterns: ["brokoli", "broccoli"] },
  { emoji: "🍄", label: "Mantar", tint: "sand", patterns: ["mantar", "shiitake", "istiridye mantarı"] },
  { emoji: "🫘", label: "Bakliyat", tint: "sand", patterns: ["fasulye", "mercimek", "barbunya", "börülce", "bezelye"] },
  { emoji: "🌽", label: "Mısır", tint: "yellow", patterns: ["mısır", "corn"] },
  { emoji: "🍚", label: "Pirinç", tint: "sand", patterns: ["pirinç", "quinoa", "kinoa", "kus kus", "kuskus", "risotto", "pilav", "pilaf"] },
  { emoji: "🍝", label: "Makarna", tint: "orange", patterns: ["gnocchi", "makarna", "spagetti", "penne", "erişte", "noodle", "lazanya"] },
  { emoji: "🍞", label: "Ekmek", tint: "sand", patterns: ["ekmek", "un", "galeta", "hamur", "panko"] },
  { emoji: "🍗", label: "Tavuk", tint: "orange", patterns: ["tavuk", "hindi", "chicken"] },
  { emoji: "🥩", label: "Et", tint: "rose", patterns: ["dana", "antrikot", "bonfile", "biftek"] },
  { emoji: "🐟", label: "Balık", tint: "blue", patterns: ["balık", "levrek", "çipura", "hamsi"] },
  { emoji: "🍤", label: "Karides", tint: "rose", patterns: ["karides", "shrimp"] },
  { emoji: "🍯", label: "Bal", tint: "yellow", patterns: ["bal", "agave"] },
  { emoji: "🍫", label: "Çikolata", tint: "sand", patterns: ["çikolata"] },
  { emoji: "🍬", label: "Şeker", tint: "rose", patterns: ["şeker", "pudra şekeri"] },
  { emoji: "☕", label: "Kahve", tint: "sand", patterns: ["kahve", "espresso", "nescafe"] },
  { emoji: "🍵", label: "Çay", tint: "sage", patterns: ["çay", "matcha"] },
  { emoji: "🫗", label: "Sıvı", tint: "blue", patterns: ["su", "soda", "maden suyu", "haşlama suyu", "pişirme suyu", "makarna suyu", "et suyu", "tavuk suyu", "sebze suyu", "kemik suyu", "sıcak su", "ılık su", "soğuk su", "kaynar su"] },
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

/** Turkish-insensitive comparison key: "Fesleğen" and "feslegen" match. */
function fold(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFC")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u");
}

function words(value: string): string[] {
  return fold(value).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

// Inflections a pattern may carry in an ingredient name: "domatesleri",
// "bademler", "suyu", "nişastası". Kept short on purpose: longer suffix
// lists start turning unrelated words into food matches.
const SUFFIX = /^(?:lar|ler|lari|leri|i|u|si|su|yi|yu|in|un|nin|nun)$/;

function wordMatches(word: string, pattern: string): boolean {
  return word === pattern || (word.startsWith(pattern) && SUFFIX.test(word.slice(pattern.length)));
}

/** Index of the last word of the match, or -1. Picks the right-most hit. */
function matchEnd(tokens: string[], pattern: string[]): number {
  for (let end = tokens.length - 1; end >= pattern.length - 1; end--) {
    const start = end - pattern.length + 1;
    if (pattern.every((p, i) => (i === pattern.length - 1 ? wordMatches(tokens[start + i], p) : tokens[start + i] === p))) return end;
  }
  return -1;
}

const COMPILED = RULES.map(rule => ({ rule, patterns: rule.patterns.map(words) }));

function resolve(text: string): FoodRule | null {
  // Turkish compound names put the head noun last: "patates gnocchi" is
  // gnocchi, "gnocchi haşlama suyu" is a liquid, "domates salçası" is paste.
  // So the right-most match wins; for the same end word the longer, more
  // specific pattern wins; then the earlier (more specific) rule.
  const tokens = words(text);
  let best: { rule: FoodRule; end: number; length: number; order: number } | null = null;
  COMPILED.forEach(({ rule, patterns }, order) => {
    for (const pattern of patterns) {
      let end = matchEnd(tokens, pattern);
      if (end < 0) continue;
      // An inflected bare "su" ("limon suyu", "limonun suyu") names the juice
      // of the food before it; it only wins when nothing else matched.
      if (pattern.length === 1 && pattern[0] === "su" && tokens[end] !== "su") end = -0.5;
      if (!best || end > best.end || (end === best.end && (pattern.length > best.length || (pattern.length === best.length && order < best.order)))) {
        best = { rule, end, length: pattern.length, order };
      }
    }
  });
  return best ? (best as { rule: FoodRule }).rule : null;
}

export function lokmaIngredient(name: string): FoodSymbol {
  const raw = typeof name === "string" ? name : "";
  // "Parmesan peyniri (veya Grana Padano / Pecorino)": an alternative in
  // parentheses must not replace the ingredient itself. Descriptive
  // qualifiers stay, because they can disambiguate: "kırmızı biber (baharat)".
  const main = raw.replace(/\(\s*(?:veya|ya da|yada|or|yerine|alternatif)\b[^()]*\)/giu, " ");
  const rule = resolve(main) || resolve(raw);
  if (rule) return { emoji: rule.emoji, label: rule.label, tint: rule.tint, ...(rule.art ? { art: rule.art } : {}) };
  return { emoji: "🍽️", label: "Malzeme", tint: "sand" };
}

/**
 * Name to illustrate a whole dish by its title ("Çikolatalı Sufle",
 * "Fıstıklı Baklava"). Titles describe the dish with "-lı/-li/-lu/-lü"
 * adjectives, which ingredient lists must not use for matching ("tuzlu
 * tereyağı" is butter), so this fallback lives only here.
 */
export function lokmaDishName(title: string): string {
  if (lokmaIngredient(title).emoji !== "🍽️") return title;
  const stripped = title.split(/\s+/).map(word => word.replace(/(?:lı|li|lu|lü)$/iu, "")).join(" ");
  return lokmaIngredient(stripped).emoji !== "🍽️" ? stripped : title;
}

export function lokmaIngredientClasses(tint: string): string {
  return BACKGROUND[tint] || BACKGROUND.sand;
}

/** Public, static reference samples for the editor's illustration catalog. */
export const LOKMA_ICON_SAMPLES = [
  {
    "category": "Sebzeler",
    "name": "Domates",
    "figure": "tomato"
  },
  {
    "category": "Sebzeler",
    "name": "Havuç",
    "figure": "carrot"
  },
  {
    "category": "Sebzeler",
    "name": "Soğan",
    "figure": "onion"
  },
  {
    "category": "Sebzeler",
    "name": "Sarımsak",
    "figure": "garlic"
  },
  {
    "category": "Sebzeler",
    "name": "Patates",
    "figure": "potato"
  },
  {
    "category": "Sebzeler",
    "name": "Acı biber",
    "figure": "pepper"
  },
  {
    "category": "Sebzeler",
    "name": "Patlıcan",
    "figure": "eggplant"
  },
  {
    "category": "Sebzeler",
    "name": "Salatalık",
    "figure": "cucumber"
  },
  {
    "category": "Sebzeler",
    "name": "Marul",
    "figure": "greens"
  },
  {
    "category": "Sebzeler",
    "name": "Brokoli",
    "figure": "broccoli"
  },
  {
    "category": "Sebzeler",
    "name": "Mantar",
    "figure": "mushroom"
  },
  {
    "category": "Sebzeler",
    "name": "Mısır",
    "figure": "corn"
  },
  {
    "category": "Sebzeler",
    "name": "Pırasa",
    "figure": "leek"
  },
  {
    "category": "Sebzeler",
    "name": "Kereviz",
    "figure": "celery"
  },
  {
    "category": "Sebzeler",
    "name": "Karnabahar",
    "figure": "cauliflower"
  },
  {
    "category": "Sebzeler",
    "name": "Enginar",
    "figure": "artichoke"
  },
  {
    "category": "Sebzeler",
    "name": "Turp",
    "figure": "radish"
  },
  {
    "category": "Sebzeler",
    "name": "Pancar",
    "figure": "beet"
  },
  {
    "category": "Sebzeler",
    "name": "Bal kabağı",
    "figure": "pumpkin"
  },
  {
    "category": "Sebzeler",
    "name": "Kuşkonmaz",
    "figure": "asparagus"
  },
  {
    "category": "Sebzeler",
    "name": "Bamya",
    "figure": "okra"
  },
  {
    "category": "Sebzeler",
    "name": "Kabak",
    "figure": "zucchini"
  },
  {
    "category": "Sebzeler",
    "name": "Bezelye",
    "figure": "pea"
  },
  {
    "category": "Sebzeler",
    "name": "Taze fasulye",
    "figure": "greenbean"
  },
  {
    "category": "Meyveler",
    "name": "Limon",
    "figure": "lemon"
  },
  {
    "category": "Meyveler",
    "name": "Portakal",
    "figure": "orange"
  },
  {
    "category": "Meyveler",
    "name": "Çilek",
    "figure": "strawberry"
  },
  {
    "category": "Meyveler",
    "name": "Elma",
    "figure": "apple"
  },
  {
    "category": "Meyveler",
    "name": "Muz",
    "figure": "banana"
  },
  {
    "category": "Meyveler",
    "name": "Kiraz",
    "figure": "cherry"
  },
  {
    "category": "Meyveler",
    "name": "Yaban mersini",
    "figure": "berry"
  },
  {
    "category": "Meyveler",
    "name": "Armut",
    "figure": "pear"
  },
  {
    "category": "Meyveler",
    "name": "Üzüm",
    "figure": "grape"
  },
  {
    "category": "Meyveler",
    "name": "Karpuz",
    "figure": "watermelon"
  },
  {
    "category": "Meyveler",
    "name": "Şeftali",
    "figure": "peach"
  },
  {
    "category": "Meyveler",
    "name": "Kivi",
    "figure": "kiwi"
  },
  {
    "category": "Meyveler",
    "name": "Ananas",
    "figure": "pineapple"
  },
  {
    "category": "Meyveler",
    "name": "Avokado",
    "figure": "avocado"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Yumurta",
    "figure": "egg"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Süt",
    "figure": "milk"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Peynir",
    "figure": "cheese"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Yoğurt",
    "figure": "yogurt"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Tereyağı",
    "figure": "butter"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Tavuk",
    "figure": "chicken"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Dana eti",
    "figure": "meat"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Levrek",
    "figure": "fish"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Karides",
    "figure": "shrimp"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Pirinç",
    "figure": "rice"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Makarna",
    "figure": "pasta"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Ekmek",
    "figure": "bread"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Kuru fasulye",
    "figure": "bean"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Un",
    "figure": "flour"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Kabartma tozu",
    "figure": "baking"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Maydanoz",
    "figure": "herb"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Yenibahar",
    "figure": "spice"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Zeytin",
    "figure": "olive"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Ayçiçek yağı",
    "figure": "oil"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Susam",
    "figure": "sesame"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Tahin",
    "figure": "sauce"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Domates salçası",
    "figure": "paste"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Bal",
    "figure": "honey"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Fındık",
    "figure": "nut"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Çikolata",
    "figure": "chocolate"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Şeker",
    "figure": "sugar"
  },
  {
    "category": "İçecekler ve diğer",
    "name": "Kahve",
    "figure": "coffee"
  },
  {
    "category": "İçecekler ve diğer",
    "name": "Çay",
    "figure": "tea"
  },
  {
    "category": "İçecekler ve diğer",
    "name": "Su",
    "figure": "liquid"
  },
  {
    "category": "İçecekler ve diğer",
    "name": "Bilinmeyen malzeme",
    "figure": "plate"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Yeşil mercimek",
    "figure": "greenlentil"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Kırmızı mercimek",
    "figure": "redlentil"
  },
  {
    "category": "Sebzeler",
    "name": "Dolmalık biber",
    "figure": "bellpepper"
  },
  {
    "category": "Sebzeler",
    "name": "Kapya biber",
    "figure": "kapiapepper"
  },
  {
    "category": "Sebzeler",
    "name": "Kırmızı biber",
    "figure": "redpepper"
  },
  {
    "category": "Sebzeler",
    "name": "Çarliston biber",
    "figure": "carliston"
  },
  {
    "category": "Sebzeler",
    "name": "Sivri biber",
    "figure": "sivri"
  },
  {
    "category": "Sebzeler",
    "name": "Yeşil biber",
    "figure": "sweetpepper"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Tuz",
    "figure": "salt"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Toz kırmızı biber",
    "figure": "paprikaspice"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Kimyon",
    "figure": "cumin"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Çubuk tarçın",
    "figure": "cinnamon"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Vanilya çubuğu",
    "figure": "vanilla"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Dereotu",
    "figure": "dill"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Roka",
    "figure": "arugula"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Ceviz",
    "figure": "walnut"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Badem",
    "figure": "almond"
  },
  {
    "category": "Sebzeler",
    "name": "Lahana",
    "figure": "cabbage"
  },
  {
    "category": "Meyveler",
    "name": "Kavun",
    "figure": "melon"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Zeytinyağı",
    "figure": "oliveoil"
  },
  {
    "category": "Meyveler",
    "name": "Yeşil elma",
    "figure": "greenapple"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Karabiber (tane)",
    "figure": "blackpepper"
  },
  {
    "category": "Sebzeler",
    "name": "Ispanak",
    "figure": "spinach"
  },
  {
    "category": "Sebzeler",
    "name": "Taze soğan",
    "figure": "greenonion"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Nane",
    "figure": "mint"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Kekik",
    "figure": "thyme"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Biberiye",
    "figure": "rosemary"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Defne yaprağı",
    "figure": "bayleaf"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Zencefil",
    "figure": "ginger"
  },
  {
    "category": "Meyveler",
    "name": "Nar",
    "figure": "pomegranate"
  },
  {
    "category": "Meyveler",
    "name": "İncir",
    "figure": "fig"
  },
  {
    "category": "Meyveler",
    "name": "Kayısı",
    "figure": "apricot"
  },
  {
    "category": "Meyveler",
    "name": "Erik",
    "figure": "plum"
  },
  {
    "category": "Meyveler",
    "name": "Hurma",
    "figure": "date"
  },
  {
    "category": "Meyveler",
    "name": "Ayva",
    "figure": "quince"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Antep fıstığı",
    "figure": "pistachio"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Hindistan cevizi",
    "figure": "coconut"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Nohut",
    "figure": "chickpea"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Bulgur",
    "figure": "bulgur"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Yulaf",
    "figure": "oats"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Zerdeçal",
    "figure": "turmeric"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Sumak",
    "figure": "sumac"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Pul biber",
    "figure": "chiliflakes"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Kakao",
    "figure": "cocoa"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Esmer şeker",
    "figure": "brownsugar"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Kıyma",
    "figure": "mince"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Kuzu pirzola",
    "figure": "lamb"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Ton balığı",
    "figure": "tuna"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Somon",
    "figure": "salmon"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Midye",
    "figure": "mussel"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Beyaz peynir",
    "figure": "whitecheese"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Labne",
    "figure": "creamcheese"
  },
  {
    "category": "Protein ve süt ürünleri",
    "name": "Krema",
    "figure": "cream"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Sirke",
    "figure": "vinegar"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Soya sosu",
    "figure": "soysauce"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Nar ekşisi",
    "figure": "pomsauce"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Pekmez",
    "figure": "molasses"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Hardal",
    "figure": "mustard"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Ketçap",
    "figure": "ketchup"
  },
  {
    "category": "Otlar, baharatlar ve soslar",
    "name": "Mayonez",
    "figure": "mayonnaise"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Maya",
    "figure": "yeast"
  },
  {
    "category": "Sebzeler",
    "name": "Turşu",
    "figure": "pickle"
  },
  {
    "category": "Tahıllar ve bakliyat",
    "name": "Lavaş",
    "figure": "flatbread"
  }
] as const;
