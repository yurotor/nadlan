import type { Lang } from "./i18n";

/** English glosses for the Tax Authority's deal-nature (מהות עסקה) values. */
export const NATURE_EN: Record<string, string> = {
  "דירה בבית קומות": "Apartment",
  "ד. מגורים": "Dwelling",
  "מגורים": "Residential (generic)",
  "ללא תיכנון": "Unplanned land",
  "קוטג' דו משפחתי": "Semi-detached house",
  "לא מעובדת": "Uncultivated land",
  "קוטג' חד משפחתי": "Detached house",
  "קרקע": "Land",
  "משרד": "Office",
  "חנות": "Shop",
  "בניין": "Whole building",
  "מחסנים": "Storage",
  "בית בודד": "Standalone house",
  "דירת גן": "Garden apartment",
  "קומבינציה": "Combination deal",
  "תעשיה": "Industrial",
  "תעשייה": "Industrial",
  "חניה": "Parking",
  "במשק חקלאי-נחלה": "Farm plot (nahala)",
  "דירת גג": "Penthouse",
  "מלאכה": "Workshop",
  "קוטג' טורי": "Terraced house",
  "מסחרי + משרדים": "Retail + offices",
  "דירת נופש": "Holiday apartment",
  "אופציה": "Option",
  "מסחרי + מגורים": "Retail + residential",
  "בניני ציבור": "Public building",
  "שלחין": "Irrigated land",
  "קבוצת רכישה - קרקע מ": "Purchase group (land)",
  "מלונאות": "Hotel",
  "משרדים + מגורים": "Offices + residential",
  "מלונאות ונופש": "Hotel & leisure",
  "משק חקלאי": "Farm",
  "פרדס": "Orchard",
  "דיור מוגן": "Assisted living",
  "תחנת דלק": "Petrol station",
};

export const natureEn = (n: string | null | undefined) => (n ? NATURE_EN[n] ?? n : "");

/** Deal nature in the UI language: the Tax Authority's own Hebrew term, or its English gloss. */
export const natureLabel = (n: string | null | undefined, lang: Lang) => (lang === "he" ? n ?? "" : natureEn(n));

export const APARTMENT_NATURES = ["דירה בבית קומות", "ד. מגורים", "דירת גן", "דירת גג", "דירת נופש", "דיור מוגן"];
export const HOUSE_NATURES = ["קוטג' דו משפחתי", "קוטג' חד משפחתי", "בית בודד", "קוטג' טורי"];

export const CLASS_EN: Record<string, string> = {
  single_unit: "Single unit, sold in full",
  unit_multi_seller: "Single unit, several sellers",
  unit_with_annex: "Unit with parking/storage",
  unit_multi_subparcel: "Several sub-parcels",
  partial_share: "Partial share of a unit",
  share_of_parcel: "Share of a parcel",
  whole_parcel: "Whole parcel",
  unit_no_area: "Unit without area",
  unit_suspect_size: "Unit with unusual size",
  land: "Land",
  commercial_other: "Commercial / other",
  building: "Whole building",
  multi_row_other: "Other multi-part sale",
};

export const CLASS_HE: Record<string, string> = {
  single_unit: "יחידה אחת, נמכרה במלואה",
  unit_multi_seller: "יחידה אחת, כמה מוכרים",
  unit_with_annex: "יחידה עם חניה או מחסן",
  unit_multi_subparcel: "כמה תתי-חלקות",
  partial_share: "חלק מיחידה",
  share_of_parcel: "חלק מחלקה",
  whole_parcel: "חלקה שלמה",
  unit_no_area: "יחידה ללא שטח",
  unit_suspect_size: "יחידה בגודל חריג",
  land: "קרקע",
  commercial_other: "מסחרי / אחר",
  building: "בניין שלם",
  multi_row_other: "עסקה מרובת חלקים אחרת",
};
export const classLabel = (c: string, lang: Lang) => (lang === "he" ? CLASS_HE[c] : CLASS_EN[c]) ?? c;

export const DISTRICT_EN: Record<string, string> = {
  "ירושלים": "Jerusalem", "צפת": "Safed", "כנרת": "Kinneret", "עפולה": "Afula", "עכו": "Acre",
  "חיפה": "Haifa", "חדרה": "Hadera", "השרון": "Sharon", "פתח תקווה": "Petah Tikva", "רמלה": "Ramla",
  "רחובות": "Rehovot", "תל אביב": "Tel Aviv", "רמת גן": "Ramat Gan", "חולון": "Holon",
  "אשקלון": "Ashkelon", "באר שבע": "Beersheba", "גולן": "Golan", "יזרעאל": "Jezreel",
  "ג'נין": "Judea & Samaria", "שכם": "Judea & Samaria", "טול כרם": "Judea & Samaria",
  "רמאללה": "Judea & Samaria", "בית לחם": "Judea & Samaria", "חברון": "Judea & Samaria",
  "ירדן (יריחו)": "Judea & Samaria", "קלקיליה": "Judea & Samaria", "אזור יהודה והשומרון": "Judea & Samaria",
};
export const districtEn = (d: string | null | undefined) => (d ? DISTRICT_EN[d] ?? d : "");
export const districtLabel = (d: string | null | undefined, lang: Lang) =>
  lang === "en" ? districtEn(d) : d && DISTRICT_EN[d] === "Judea & Samaria" ? "יהודה ושומרון" : d ?? "";
