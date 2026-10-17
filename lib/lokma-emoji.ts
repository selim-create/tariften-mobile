/**
 * TARİFTEN / LOKMA
 * A small brand-friendly semantic food and reaction language.
 *
 * Emoji are decorative; adjacent text remains the source of ingredient truth.
 * Mapping is local/deterministic: no requests, model calls, or invented food.
 * Uses the identical Web semantic rules and editorial art IDs, rendered as native offline vector miniatures.
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
  { emoji: "🧂", art: "paprikaspice", label: "Toz kırmızı biber", tint: "rose", patterns: ["kırmızı biber baharat","kırmızı biber tozu","kırmızı toz biber","toz kırmızı biber","tatlı toz biber","acı toz biber","pul biber","isot","paprika"] },
  { emoji: "🫘", art: "greenlentil", label: "Yeşil mercimek", tint: "sage", patterns: ["yeşil mercimek","yesil mercimek"] },
  { emoji: "🫘", art: "redlentil", label: "Kırmızı mercimek", tint: "orange", patterns: ["kırmızı mercimek","kirmizi mercimek"] },
  { emoji: "🌶️", art: "bellpepper", label: "Dolmalık biber", tint: "sage", patterns: ["dolmalık biber","dolma biber","dolmalik biber"] },
  { emoji: "🌶️", art: "kapiapepper", label: "Kapya biber", tint: "rose", patterns: ["kapya","kapya biber"] },
  { emoji: "🌶️", art: "redpepper", label: "Kırmızı biber", tint: "rose", patterns: ["kırmızı biber","kirmizi biber"] },
  { emoji: "🌶️", art: "carliston", label: "Çarliston biber", tint: "sage", patterns: ["çarliston","carliston"] },
  { emoji: "🌶️", art: "sivri", label: "Sivri biber", tint: "sage", patterns: ["sivri biber","sivri"] },
  { emoji: "🌶️", art: "sweetpepper", label: "Biber", tint: "sage", patterns: ["yeşil biber","yesil biber"] },
  { emoji: "🧂", art: "salt", label: "Tuz", tint: "sand", patterns: ["tuz","kaya tuzu","deniz tuzu","iri tuz"] },
  { emoji: "🧂", art: "cumin", label: "Kimyon", tint: "sand", patterns: ["kimyon","cumin"] },
  { emoji: "🧂", art: "cinnamon", label: "Çubuk tarçın", tint: "sand", patterns: ["çubuk tarçın","tarçın çubuğu","cinnamon stick"] },
  { emoji: "🌿", art: "vanilla", label: "Vanilya çubuğu", tint: "sand", patterns: ["vanilya çubuğu","vanilya çubukları","vanilla pod"] },
  { emoji: "🌿", art: "dill", label: "Dereotu", tint: "sage", patterns: ["dereotu","dere otu"] },
  { emoji: "🌿", art: "arugula", label: "Roka", tint: "sage", patterns: ["roka","arugula"] },
  { emoji: "🌰", art: "walnut", label: "Ceviz", tint: "sand", patterns: ["ceviz","walnut"] },
  { emoji: "🌰", art: "almond", label: "Badem", tint: "sand", patterns: ["badem","almond"] },
  { emoji: "🥬", art: "cabbage", label: "Lahana", tint: "sage", patterns: ["lahana","beyaz lahana","kırmızı lahana","mor lahana"] },
  { emoji: "🍉", art: "melon", label: "Kavun", tint: "yellow", patterns: ["kavun","melon"] },
  { emoji: "🫒", art: "oliveoil", label: "Zeytinyağı", tint: "yellow", patterns: ["zeytinyağı","zeytin yağı","zeytin yagı","sızma zeytinyağı","sızma zeytin yağı","olive oil"] },
  { emoji: "🍎", art: "greenapple", label: "Yeşil elma", tint: "sage", patterns: ["yeşil elma","yesil elma","granny smith"] },
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
  { emoji: "🍞", art: "baking", label: "Kabartma malzemesi", tint: "sand", patterns: ["kabartma tozu", "vanilin", "vanilya şekeri", "karbonat", "instant maya", "kuru maya", "yaş maya"] },
  { emoji: "🌰", art: "sesame", label: "Tohum", tint: "sand", patterns: ["susam", "çörek otu", "chia tohumu", "keten tohumu", "haşhaş"] },
  { emoji: "🍯", art: "sauce", label: "Sos", tint: "sand", patterns: ["tahin", "nar ekşisi", "soya sosu", "ketçap", "hardal", "mayonez", "worcestershire"] },
  { emoji: "🍅", art: "paste", label: "Salça", tint: "rose", patterns: ["domates salçası", "biber salçası", "salça"] },
  { emoji: "🍅", label: "Domates", tint: "rose", patterns: ["domates", "domatesi", "domatesin", "domatas", "domatez", "tomato", "domates salçası"] },
  { emoji: "🥕", label: "Havuç", tint: "orange", patterns: ["havuç", "carrot"] },
  { emoji: "🧅", label: "Soğan", tint: "sand", patterns: ["soğan", "soğanı", "sogan", "arpacık"] },
  { emoji: "🧄", label: "Sarımsak", tint: "sand", patterns: ["sarımsak", "sarmısak", "sarimsak", "garlic"] },
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
  { emoji: "🧈", label: "Tereyağı", tint: "yellow", patterns: ["tereyağı", "tereyagi", "margarin", "butter"] },
  { emoji: "🫒", label: "Zeytin", tint: "sage", patterns: ["zeytinyağı", "zeytin yağı", "zeytin yagı", "zeytin", "olive"] },
  { emoji: "🌿", label: "Taze otlar", tint: "sage", patterns: ["fesleğen", "maydanoz", "dereotu", "nane", "kekik", "biberiye", "kişniş", "roka", "taze ot", "defne", "taze soğan", "yeşil soğan", "semizotu", "tere", "reyhan", "tarhun", "frenk soğanı"] },
  { emoji: "🧂", label: "Baharat", tint: "sand", patterns: ["karabiber", "tuz", "deniz tuzu", "kaya tuzu", "kimyon", "zerdeçal", "tarçın", "köri", "sumak", "pul biber", "yenibahar", "muskat", "safran", "isot", "karanfil", "kakule", "zencefil", "toz zencefil", "kırmızı toz biber"] },
  { emoji: "🌶️", art: "pepper", label: "Acı biber", tint: "rose", patterns: ["acı biber", "aci biber", "chili", "jalapeño"] },
  { emoji: "🌶️", art: "sweetpepper", label: "Biber", tint: "sage", patterns: ["biber"] },
  { emoji: "🍆", label: "Patlıcan", tint: "lavender", patterns: ["patlıcan", "aubergine"] },
  { emoji: "🥒", label: "Salatalık", tint: "sage", patterns: ["salatalık", "kornişon", "kabak", "zucchini"] },
  { emoji: "🥬", label: "Yeşillik", tint: "sage", patterns: ["marul", "ıspanak", "lahana", "pazı", "kale"] },
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
      return { emoji: rule.emoji, label: rule.label, tint: rule.tint, ...(rule.art ? { art: rule.art } : {}) };
    }
  }
  return { emoji: "🍽️", label: "Malzeme", tint: "sand" };
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
    "name": "Somon balığı",
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
    "name": "Karabiber",
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
  }
] as const;
