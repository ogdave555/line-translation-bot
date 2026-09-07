/**
 * Thai-English Translation Glossary — Reference data for API providers
 * Adapted from DMTranslateApp model-guides/glossary.md
 * Exported as structured data for injection into system prompts
 */

export const thaiPragmaticParticles = [
  { thai: "ค่ะ / คะ", meaning: "Polite particle (female)", english: "Softener: 'please', 'xx', gentle emoji" },
  { thai: "ค่า", meaning: "Soft emphasis (female)", english: "'yeah', 'ok', trailing softener" },
  { thai: "นะ", meaning: "Soft request/emphasis", english: "'please', 'ok', trailing softener" },
  { thai: "่ะ (ะ)", meaning: "Casual imperative", english: "Direct but not harsh" },
  { thai: "จ้า", meaning: "Friendly assertion", english: "'yeah', 'alright', 'you know'" },
  { thai: "เนอะ", meaning: "Agreement/confirmation", english: "'right', 'yeah', 'exactly'" },
  { thai: "ฮะ", meaning: "Soft question (male)", english: "'hmm', 'really?'" },
  { thai: "อ่ะ / อ่", meaning: "Hesitation/filler", english: "'um', 'well', 'like'" },
];

export const thaiLaughingExpressions = [
  { thai: "555", meaning: "Laughing (most common)", english: "'555' or 'haha' (NOT 'lol')" },
  { thai: "5555", meaning: "Extended laughing", english: "'5555' or 'hahaha'" },
  { thai: "55555", meaning: "Extended laughing", english: "'55555'" },
  { thai: "555+", meaning: "Extended laughing", english: "'555+'" },
  { thai: "ฮิฮิ", meaning: "Light giggle", english: "'hehe', 'tee hee'" },
  { thai: "ขำๆ", meaning: "Chuckle", english: "'haha', 'chuckle'" },
  { thai: "ฮ่า", meaning: "Onomatopoeic laughter", english: "'ha', 'haha'" },
  { thai: "ฮ่าๆ", meaning: "Extended laughter", english: "'haha', 'hahaha'" },
  { thai: "อิ / อิอิ", meaning: "Giggle", english: "'heh', 'tee hee'" },
];

export const thaiPronouns = {
  britishMale: [
    { english: "I/me", thai: "ผม, ฉัน (casual)", note: "Informal, intimate" },
    { english: "you", thai: "เธอ, มึง (very casual)", note: "Intimate, casual" },
    { english: "we", thai: "เรา, พวกเรา", note: "Inclusive" },
    { english: "love", thai: "รัก, เซอร์ไพรส์", note: "Context-dependent" },
    { english: "partner/girlfriend", thai: "แฟน, คนที่รัก", note: "Casual reference" },
    { english: "sorry", thai: "ขอโทษ, ผิดไป", note: "Apologetic tone" },
  ],
  thaiFemale: [
    { thai: "ฉัน, กิน, ดิฉัน", english: "I/me", note: "Formal to casual" },
    { thai: "เธอ, มึง", english: "you", note: "Intimate but non-native may overuse 'you'" },
    { thai: "เรา", english: "we/us", note: "Inclusive" },
    { thai: "รัก", english: "love", note: "May translate as 'love' simply" },
    { thai: "ที่รัก, ที่แน่", english: "dear, honey", note: "Term of endearment" },
    { thai: "ขอโทษ", english: "sorry", note: "Apologetic" },
  ],
};

export const thaiRegisterLevels = [
  { register: "Formal", thai: "อรุณสวัสดิ์, ขอบคุณครับ/ค่ะ", when: "NEVER for casual chat (overly formal)" },
  { register: "Polite", thai: "สวัสดีค่ะ, ขอบคุณ", when: "Service context" },
  { register: "Casual", thai: "ไง, ดีจ้า, เราไปกัน", when: "Close relationship" },
  { register: "Very Casual", thai: "หวัด, ไอ้, มึง", when: "Intimate/casual LINE chat" },
];

export const casualThaiExpressions = [
  { formal: "ได้เลย", casual: "ก็ได้", english: "fine/sure" },
  { formal: "ไม่ต้องการ", casual: "ไม่เอา", english: "don't want" },
  { formal: "เป็นอย่างมาก", casual: "มากๆ, สุดๆ", english: "very much" },
  { formal: "สวยมาก", casual: "สวยจัง, สวยมั้ย", english: "very pretty" },
  { formal: "รักมาก", casual: "รักเท่าไหร่", english: "love so much" },
  { formal: "น่ารัก", casual: "น่ารักจังเลย", english: "so cute" },
  { formal: "ขอบคุณ", casual: "ขอบใจ, ขอบคุณนะ", english: "thanks" },
];

export const paliSanskritTerms = [
  { term: "Bhariya", thai: "ภาริยา", meaning: "Wife (Pali)" },
  { term: "Gharavasa", thai: "ฆราวาส", meaning: "Householder (Pali)" },
  { term: "Nibbana/Nirvana", thai: "นิพพาน", meaning: "Liberation" },
  { term: "Kamma/Karma", thai: "กรรม", meaning: "Action/consequence" },
  { term: "Sanga/Sangha", thai: "สงฆ์", meaning: "Buddhist community" },
  { term: "Phra", thai: "พระ", meaning: "Reverend/Buddhist monk" },
];

export const thaiNumbers = {
  arabic: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  thaiNumerals: ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"],
  words: [
    { arabic: 1, thai: "หนึ่ง", numeral: "๑" },
    { arabic: 2, thai: "สอง", numeral: "๒" },
    { arabic: 3, thai: "สาม", numeral: "๓" },
    { arabic: 4, thai: "สี่", numeral: "๔" },
    { arabic: 5, thai: "ห้า", numeral: "๕" },
    { arabic: 10, thai: "สิบ", numeral: "๑๐" },
    { arabic: 100, thai: "ร้อย", numeral: "๑๐๐" },
    { arabic: 1000, thai: "พัน", numeral: "๑๐๐๐" },
    { arabic: 1500, thai: "หนึ่งพันห้าร้อย", numeral: "๑,๕๐๐" },
  ],
};

export const thaiEnglishWordPairs = [
  { thai: "ชอบ", nativeEnglish: "like, love", nonNative: "like so much" },
  { thai: "เป็นมือเป็นเท้า", nativeEnglish: "help out", nonNative: "help me" },
  { thai: "ไปด้วยกัน", nativeEnglish: "go together", nonNative: "go together" },
  { thai: "ไม่เป็นไร", nativeEnglish: "no problem", nonNative: "it's ok" },
  { thai: "เดี๋ยว", nativeEnglish: "wait, later", nonNative: "wait ah, later ok?" },
  { thai: "งั้น", nativeEnglish: "then, so", nonNative: "then, so" },
  { thai: "อ่ะ", nativeEnglish: "um, well", nonNative: "um, like" },
  { thai: "ก่อนนะ", nativeEnglish: "before", nonNative: "first ok?" },
];

export const explicitVulgarThaiTerms = [
  { english: "fuck", thai: "ควย, เหี้ย", register: "Very vulgar" },
  { english: "shit", thai: "ขี้, อึ", register: "Vulgar" },
  { english: "damn", thai: "บ้า, เลว", register: "Mild-moderate" },
  { english: "ass", thai: "ก้น, ตูด", register: "Vulgar" },
  { english: "breasts", thai: "ตัว, นม", register: "Slang/vulgar" },
  { english: "dick", thai: "จู๋, สนอง", register: "Slang" },
  { english: "fuck off", thai: "หายไป", register: "command" },
];

export const thaiRelationshipDynamics = [
  { english: "my love", thai: "ที่รัก, รักของผม/ฉัน", nuance: "Endearment" },
  { english: "darling", thai: "ที่แน่, ที่หนู", nuance: "Intimate" },
  { english: "I miss you", thai: "คิดถึงจังเลย", nuance: "Casual/intimate" },
  { english: "I'm angry", thai: "หัวใจแตกสลาย", nuance: "Dramatic/relationship" },
  { english: "breakup", thai: "เลิกกัน", nuance: "Direct" },
  { english: "make up", thai: "กลับมาคืนดี", nuance: "Reconciling" },
];

export const lineChatAbbreviations = [
  { full: "ส่วนตัว", abbreviation: "ส่วนตัว", usage: "personal (no change)" },
  { full: "อะไรนะ", abbreviation: "อะไร, อาราย", usage: "what" },
  { full: "เดี๋ยวนะ", abbreviation: "เดี๋ยว, ดือ", usage: "wait" },
  { full: "เป็นไรไหม", abbreviation: "เป็นไรมั้ย", usage: "are you ok?" },
  { full: "ทำไม", abbreviation: "ทำไม", usage: "why" },
  { full: "อย่างนั้น", abbreviation: "อั้น", usage: "like that" },
  { full: "อย่างไร", abbreviation: "อั้ย", usage: "how" },
];

export const britishEnglishAvoidList = [
  { forbidden: "mate", useInstead: "friend, you" },
  { forbidden: "fancy (verb)", useInstead: "like" },
  { forbidden: "reckon", useInstead: "think" },
  { forbidden: "bloody", useInstead: "really, so" },
  { forbidden: "blimey", useInstead: "wow, gosh" },
  { forbidden: "cheeky", useInstead: "playful, a bit much" },
  { forbidden: "gutted", useInstead: "really sad" },
  { forbidden: "knackered", useInstead: "really tired" },
  { forbidden: "dodgy", useInstead: "suspicious, weird" },
  { forbidden: "skint", useInstead: "broke, no money" },
  { forbidden: "brilliant", useInstead: "so good, really nice" },
  { forbidden: "brill", useInstead: "great" },
  { forbidden: "innit", useInstead: "(avoid entirely)" },
  { forbidden: "yeah? (tag)", useInstead: "right?" },
  { forbidden: "loads of", useInstead: "a lot of, many" },
  { forbidden: "sort of (hedge)", useInstead: "a bit, kinda" },
  { forbidden: "quite (hedge)", useInstead: "really, pretty" },
  { forbidden: "gonna", useInstead: "going to" },
  { forbidden: "wanna", useInstead: "want to" },
  { forbidden: "gotta", useInstead: "got to" },
  { forbidden: "kinda", useInstead: "a bit" },
  { forbidden: "sorta", useInstead: "a bit" },
  { forbidden: "lol", useInstead: "haha" },
  { forbidden: "lmao", useInstead: "hahaha" },
  { forbidden: "sus", useInstead: "suspicious" },
  { forbidden: "vibe", useInstead: "feeling" },
];

export const thaiEnglishSoftenerMapping = [
  { thai: "ค่ะ/คะ", effect: "Softens statement", english: "'please', 'xx', soft emoji" },
  { thai: "555", effect: "Laughing", english: "'haha', '555' (NOT lol)" },
  { thai: "อ่ะ/นะ", effect: "Request softener", english: "'ok?', 'please?', 'yeah?'" },
  { thai: "จ้า", effect: "Friendly assertion", english: "'yeah', 'alright'" },
  { thai: "เนอะ", effect: "Confirmation check", english: "'right?', 'yeah?'" },
  { thai: "ฮะ", effect: "Question softener", english: "'hmm?', 'really?'" },
];

export const countryPlaceNames = [
  { english: "England", thai: "อังกฤษ", script: "Thai" },
  { english: "British", thai: "อังกฤษ", script: "Thai" },
  { english: "UK", thai: "สหราชอาณาจักร", script: "Thai" },
  { english: "Thailand", thai: "ไทย", script: "Thai" },
  { english: "Bangkok", thai: "กรุงเทพฯ", script: "Thai" },
  { english: "USA", thai: "อเมริกา, ยูเอสเอ", script: "Thai" },
];

export const fixedTransliterations = [
  { english: "kratom / Kratom", thai: "กระท่อม", note: "NEVER 'กระโต้ม', 'กระต่ำ', 'กระทม', 'กระทอม'" },
  { english: "Miw (nickname)", thai: "มิว", note: "NEVER 'เมว', 'มือ', 'หมีว์'" },
];

export const productBrandNames = [
  "LINE", "Facebook", "Instagram", "YouTube", "Google", "iPhone", "Samsung",
];

export const currency = [
  { amount: "£10", english: "ten pounds", thai: "สิบปอนด์" },
  { amount: "£20", english: "twenty pounds", thai: "ยี่สิบปอนด์" },
  { amount: "100 baht", english: "one hundred baht", thai: "ร้อยบาท" },
  { amount: "500 baht", english: "five hundred baht", thai: "ห้าร้อยบาท" },
];

/**
 * Build the full glossary as a formatted string for injection into system prompts
 */
export function formatGlossaryForPrompt(): string {
  const sections: string[] = [];

  sections.push("=== THAI-ENGLISH TRANSLATION GLOSSARY ===");
  sections.push("");

  sections.push("--- Thai Pragmatic Particles ---");
  for (const p of thaiPragmaticParticles) {
    sections.push(`  ${p.thai} = ${p.english} (${p.meaning})`);
  }
  sections.push("");

  sections.push("--- Thai Laughing Expressions ---");
  for (const e of thaiLaughingExpressions) {
    sections.push(`  ${e.thai} = ${e.english} (${e.meaning})`);
  }
  sections.push("");

  sections.push("--- Thai Pronouns & Terms ---");
  sections.push("  British Male (en→th):");
  for (const p of thaiPronouns.britishMale) {
    sections.push(`    ${p.english} → ${p.thai} (${p.note})`);
  }
  sections.push("  Thai Female (th→en):");
  for (const p of thaiPronouns.thaiFemale) {
    sections.push(`    ${p.thai} → ${p.english} (${p.note})`);
  }
  sections.push("");

  sections.push("--- Thai Register Levels ---");
  for (const r of thaiRegisterLevels) {
    sections.push(`  ${r.register}: ${r.thai} — ${r.when}`);
  }
  sections.push("");

  sections.push("--- Casual Thai Expressions ---");
  for (const c of casualThaiExpressions) {
    sections.push(`  ${c.formal} → ${c.casual} (${c.english})`);
  }
  sections.push("");

  sections.push("--- Pali/Sanskrit Buddhist Terms (PRESERVE in Thai script, do NOT translate meaning) ---");
  for (const t of paliSanskritTerms) {
    sections.push(`  ${t.term} = ${t.thai} (${t.meaning})`);
  }
  sections.push("");

  sections.push("--- Thai Numbers ---");
  sections.push(`  Arabic: ${thaiNumbers.arabic.join(", ")}`);
  sections.push(`  Thai Numerals: ${thaiNumbers.thaiNumerals.join(", ")}`);
  for (const n of thaiNumbers.words) {
    sections.push(`  ${n.arabic} = ${n.thai} (${n.numeral})`);
  }
  sections.push("");

  sections.push("--- Common Thai-English Word Pairs ---");
  for (const w of thaiEnglishWordPairs) {
    sections.push(`  ${w.thai} → ${w.nonNative} (native: ${w.nativeEnglish})`);
  }
  sections.push("");

  sections.push("--- Explicit/Vulgar Thai Terms (translate faithfully, do NOT censor) ---");
  for (const t of explicitVulgarThaiTerms) {
    sections.push(`  ${t.english} → ${t.thai} (${t.register})`);
  }
  sections.push("");

  sections.push("--- Thai Relationship Dynamics ---");
  for (const d of thaiRelationshipDynamics) {
    sections.push(`  ${d.english} → ${d.thai} (${d.nuance})`);
  }
  sections.push("");

  sections.push("--- LINE Chat Abbreviations ---");
  for (const l of lineChatAbbreviations) {
    sections.push(`  ${l.full} → ${l.abbreviation} (${l.usage})`);
  }
  sections.push("");

  sections.push("--- British English Avoid List (for Thai Female th→en persona) ---");
  for (const b of britishEnglishAvoidList) {
    sections.push(`  DO NOT use '${b.forbidden}' — use '${b.useInstead}' instead`);
  }
  sections.push("");

  sections.push("--- Thai → English Softener Mapping ---");
  for (const s of thaiEnglishSoftenerMapping) {
    sections.push(`  ${s.thai} → ${s.effect}: ${s.english}`);
  }
  sections.push("");

  sections.push("--- Country/Place Names ---");
  for (const c of countryPlaceNames) {
    sections.push(`  ${c.english} → ${c.thai}`);
  }
  sections.push("");

  sections.push("--- Fixed Transliterations (do NOT guess) ---");
  for (const f of fixedTransliterations) {
    sections.push(`  ${f.english} → ${f.thai} (${f.note})`);
  }
  sections.push("");

  sections.push("--- Product/Brand Names (preserve exactly, no translation) ---");
  sections.push(`  ${productBrandNames.join(", ")}`);
  sections.push("");

  sections.push("--- Currency ---");
  for (const c of currency) {
    sections.push(`  ${c.amount} = ${c.english} → ${c.thai}`);
  }
  sections.push("");

  sections.push("=== END GLOSSARY ===");

  return sections.join("\n");
}
