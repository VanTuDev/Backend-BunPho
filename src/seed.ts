/**
 * Seed the database with the starter BunPho menu + tables 1..20.
 *
 *   npm run seed            # upsert categories / dishes / tables (safe to re-run)
 *   npm run seed -- --wipe  # delete existing categories + menu items first
 *
 * Content is trilingual (ru / en / vi). Dish names are Vietnamese proper nouns
 * (same in every language). Seed images point at files shipped in the frontend
 * `public/images` folder so the menu looks good before any upload.
 */
import { connectDb, disconnectDb } from "./db";
import Category from "./models/Category";
import MenuItem from "./models/MenuItem";
import Table from "./models/Table";
import { slugify } from "./models/shared";

type L = { ru: string; en: string; vi: string };
const mono = (v: string): L => ({ ru: v, en: v, vi: v });
const img = (file: string) => ({ url: `/images/${file}`, publicId: "" });

const categories: { slug: string; name: L; sortOrder: number }[] = [
  { slug: "starters", name: { ru: "Закуски", en: "Starters", vi: "Khai vị" }, sortOrder: 1 },
  { slug: "pho", name: { ru: "Фо", en: "Phở", vi: "Phở" }, sortOrder: 2 },
  { slug: "noodles", name: { ru: "Лапша", en: "Noodles", vi: "Bún & Mì" }, sortOrder: 3 },
  { slug: "rice", name: { ru: "Рис", en: "Rice", vi: "Cơm" }, sortOrder: 4 },
  { slug: "drinks", name: { ru: "Напитки", en: "Drinks", vi: "Đồ uống" }, sortOrder: 5 },
];

interface SeedDish {
  name: L;
  categorySlug: string;
  price: number;
  description: L;
  image?: { url: string; publicId: string };
  featured?: boolean;
  variants?: { name: L; price: number }[];
}

const V = {
  chicken: { ru: "Курица", en: "Chicken", vi: "Gà" },
  beef: { ru: "Говядина", en: "Beef", vi: "Bò" },
  pork: { ru: "Свинина", en: "Pork", vi: "Heo" },
  shrimp: { ru: "Креветки", en: "Shrimp", vi: "Tôm" },
  seafood: { ru: "Морепродукты", en: "Seafood", vi: "Hải sản" },
  vegetable: { ru: "Овощи", en: "Vegetable", vi: "Rau củ" },
  hot: { ru: "Горячий", en: "Hot", vi: "Nóng" },
  iced: { ru: "Со льдом", en: "Iced", vi: "Đá" },
};

const dishes: SeedDish[] = [
  {
    name: mono("Nem Tôm"),
    categorySlug: "starters",
    price: 480,
    image: img("nem-tom.png"),
    description: {
      ru: "Хрустящие роллы из рисовой бумаги с креветками, свининой, грибами шиитаке и стеклянной лапшой, подаются с соусом ныок мам.",
      en: "Crisp rice-paper rolls filled with prawns, pork, shiitake and glass noodles, served with nước mắm dipping sauce.",
      vi: "Nem cuốn bánh tráng giòn rụm với tôm, thịt heo, nấm hương và miến, ăn kèm nước mắm chua ngọt.",
    },
  },
  {
    name: mono("Nem Gà"),
    categorySlug: "starters",
    price: 420,
    image: img("nem-ga.png"),
    description: {
      ru: "Нежные спринг-роллы с курицей, грибами и овощами, обжаренные до золотистой корочки.",
      en: "Delicate spring rolls of chicken, mushrooms and vegetables, fried to a golden crunch.",
      vi: "Nem gà cuộn mỏng với nấm và rau củ, chiên vàng giòn rụm.",
    },
  },
  {
    name: mono("Gỏi Cuốn"),
    categorySlug: "starters",
    price: 380,
    image: img("goi-cuon.png"),
    description: {
      ru: "Свежие роллы из рисовой бумаги с креветками, зеленью и рисовой вермишелью, подаются с арахисовым соусом.",
      en: "Fresh rice-paper rolls with prawns, herbs and rice vermicelli, served with peanut sauce.",
      vi: "Gỏi cuốn tươi với tôm, rau thơm và bún, chấm tương đậu phộng.",
    },
  },
  {
    name: mono("Phở Bò"),
    categorySlug: "pho",
    price: 550,
    featured: true,
    image: img("pho-bo.png"),
    description: {
      ru: "Говядина, рисовая лапша, ростки сои, свежая зелень и зелёный лук в насыщенном костном бульоне.",
      en: "Beef, rice noodles, bean sprouts, fresh herbs and spring onion in a rich bone broth.",
      vi: "Thịt bò, bánh phở, giá đỗ, rau thơm và hành lá trong nước dùng xương đậm đà.",
    },
  },
  {
    name: mono("Phở Gà"),
    categorySlug: "pho",
    price: 550,
    image: img("pho-bo.png"),
    description: {
      ru: "Курица, рисовая лапша, ростки сои, зелень и зелёный лук в прозрачном ароматном бульоне.",
      en: "Chicken, rice noodles, bean sprouts, herbs and spring onion in a clear aromatic broth.",
      vi: "Thịt gà, bánh phở, giá đỗ, rau thơm và hành lá trong nước dùng trong và thơm.",
    },
  },
  {
    name: mono("Phở Sốt Vang"),
    categorySlug: "pho",
    price: 590,
    image: img("pho-bo.png"),
    description: {
      ru: "Тушёная говядина, рисовая лапша, ростки сои, зелень и зелёный лук в пряном бульоне на красном вине.",
      en: "Slow-braised beef, rice noodles, bean sprouts, herbs and spring onion in a spiced wine-dark broth.",
      vi: "Bò sốt vang hầm mềm, bánh phở, giá đỗ, rau thơm và hành lá trong nước dùng vang đỏ đậm vị.",
    },
  },
  {
    name: mono("Bún Chả Chan"),
    categorySlug: "pho",
    price: 550,
    image: img("pho-bo.png"),
    description: {
      ru: "Суп с рисовой лапшой, свининой на гриле, фрикадельками, зелёным луком и хрустящим шалотом.",
      en: "Rice-noodle soup with flame-grilled pork, meatballs, spring onion and crispy shallots.",
      vi: "Bún chan với chả nướng, mọc, hành lá và hành phi giòn.",
    },
  },
  {
    name: mono("Tom Yum"),
    categorySlug: "pho",
    price: 550,
    description: {
      ru: "Куриный бульон на кокосовом молоке с рисом, грибами и зеленью.",
      en: "Chicken broth on coconut milk with rice, mushrooms and herbs.",
      vi: "Nước dùng gà nấu nước cốt dừa với cơm, nấm và rau thơm.",
    },
    variants: [
      { name: V.chicken, price: 550 },
      { name: V.shrimp, price: 590 },
    ],
  },
  {
    name: mono("Bún Thịt Nướng"),
    categorySlug: "noodles",
    price: 550,
    featured: true,
    image: img("bun-thit-nuong.png"),
    description: {
      ru: "Лапша бун, мясо на гриле, овощи, ростки сои, огурец и зелень с кисло-сладким рыбным соусом.",
      en: "Bún noodles, grilled meat, vegetables, bean sprouts, cucumber and herbs with a sweet-and-sour fish sauce.",
      vi: "Bún, thịt nướng, rau củ, giá đỗ, dưa leo và rau thơm với nước mắm chua ngọt.",
    },
    variants: [
      { name: V.pork, price: 550 },
      { name: V.chicken, price: 550 },
      { name: V.beef, price: 590 },
    ],
  },
  {
    name: mono("Bún Bò Nam Bộ"),
    categorySlug: "noodles",
    price: 550,
    image: img("bun-thit-nuong.png"),
    description: {
      ru: "Рисовая вермишель, морковь, ростки сои, огурец, зелень и арахис с кисло-сладким соусом.",
      en: "Rice vermicelli, carrot, bean sprouts, cucumber, herbs and peanuts with a sweet-and-sour sauce.",
      vi: "Bún, cà rốt, giá đỗ, dưa leo, rau thơm và đậu phộng với nước trộn chua ngọt.",
    },
    variants: [
      { name: V.beef, price: 550 },
      { name: V.chicken, price: 550 },
    ],
  },
  {
    name: mono("Pad Thái"),
    categorySlug: "noodles",
    price: 520,
    image: img("pad-thai.png"),
    description: {
      ru: "Обжаренная рисовая лапша с креветками, арахисом, яйцом, ростками сои и лаймом.",
      en: "Stir-fried rice noodles with prawns, peanuts, egg, bean sprouts and lime.",
      vi: "Mì gạo xào với tôm, đậu phộng, trứng, giá đỗ và chanh.",
    },
  },
  {
    name: mono("Mì Xào"),
    categorySlug: "noodles",
    price: 550,
    image: img("pad-thai.png"),
    description: {
      ru: "Яичная лапша вок с овощами, ростками сои и зелёным луком в пикантном соусе.",
      en: "Wok-fried egg noodles with vegetables, bean sprouts and spring onion in a savoury sauce.",
      vi: "Mì trứng xào rau củ, giá đỗ và hành lá với sốt đậm đà.",
    },
    variants: [
      { name: V.chicken, price: 550 },
      { name: V.beef, price: 590 },
      { name: V.shrimp, price: 590 },
    ],
  },
  {
    name: mono("Cơm Bò Lúc Lắc"),
    categorySlug: "rice",
    price: 600,
    featured: true,
    image: img("com-bo-luc-lac.png"),
    description: {
      ru: "«Трясущаяся» говядина — нежные кубики вырезки, обжаренные в воке с овощами, подаются с ароматным рисом.",
      en: '"Shaking" beef — tender cubes of tenderloin wok-tossed with vegetables, served with fragrant rice.',
      vi: "Bò lúc lắc — thăn bò cắt hạt lựu xào lửa lớn với rau củ, ăn kèm cơm thơm.",
    },
  },
  {
    name: mono("Cơm Rang"),
    categorySlug: "rice",
    price: 480,
    image: img("com-rang.png"),
    description: {
      ru: "Жареный рис с овощами, яйцом и соевым соусом.",
      en: "Fried rice with vegetables, egg and soy sauce.",
      vi: "Cơm rang với rau củ, trứng và nước tương.",
    },
    variants: [
      { name: V.vegetable, price: 480 },
      { name: V.chicken, price: 520 },
      { name: V.seafood, price: 590 },
    ],
  },
  {
    name: mono("Cơm Gà"),
    categorySlug: "rice",
    price: 520,
    image: img("com-rang.png"),
    description: {
      ru: "Маринованная курица с ароматным рисом, соленьями и свежей зеленью.",
      en: "Marinated chicken with fragrant rice, pickles and fresh herbs.",
      vi: "Gà ướp đậm vị với cơm thơm, đồ chua và rau thơm.",
    },
  },
  {
    name: mono("Cà Phê Sữa"),
    categorySlug: "drinks",
    price: 220,
    description: {
      ru: "Вьетнамский капельный кофе со сгущённым молоком.",
      en: "Vietnamese drip coffee with sweetened condensed milk.",
      vi: "Cà phê phin Việt Nam với sữa đặc.",
    },
    variants: [
      { name: V.hot, price: 220 },
      { name: V.iced, price: 250 },
    ],
  },
  {
    name: mono("Trà Sen"),
    categorySlug: "drinks",
    price: 180,
    description: {
      ru: "Зелёный чай с ароматом цветка лотоса, подаётся в чайнике.",
      en: "Green tea scented with lotus blossom, served in a pot.",
      vi: "Trà xanh ướp hương sen, phục vụ trong ấm.",
    },
  },
  {
    name: mono("Sinh Tố Xoài"),
    categorySlug: "drinks",
    price: 280,
    description: {
      ru: "Смузи из свежего манго с йогуртом и ноткой лайма.",
      en: "Fresh mango smoothie blended with yoghurt and a touch of lime.",
      vi: "Sinh tố xoài tươi xay với sữa chua và chút chanh.",
    },
  },
];

/** Upsert categories + dishes + tables. Assumes a live mongoose connection. */
export async function seedDatabase({ wipe = false }: { wipe?: boolean } = {}) {
  if (wipe) {
    await MenuItem.deleteMany({});
    await Category.deleteMany({});
    console.log("[seed] wiped categories + menu items");
  }

  const catBySlug = new Map<string, string>();
  for (const c of categories) {
    const doc = await Category.findOneAndUpdate(
      { slug: c.slug },
      { $set: { name: c.name, sortOrder: c.sortOrder, active: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    catBySlug.set(c.slug, doc!.id);
  }
  console.log(`[seed] ${categories.length} categories`);

  let order = 0;
  for (const d of dishes) {
    order += 1;
    await MenuItem.findOneAndUpdate(
      { "name.en": d.name.en },
      {
        $set: {
          name: d.name,
          description: d.description,
          category: catBySlug.get(d.categorySlug),
          price: d.price,
          image: d.image ?? null,
          variants: d.variants ?? [],
          featured: Boolean(d.featured),
          available: true,
          sortOrder: order,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  console.log(`[seed] ${dishes.length} menu items`);

  let tables = 0;
  for (let n = 1; n <= 20; n++) {
    const label = String(n);
    const res = await Table.updateOne(
      { code: slugify(label) },
      { $setOnInsert: { label, code: slugify(label), type: "standard", active: true } },
      { upsert: true },
    );
    if (res.upsertedCount) tables += 1;
  }
  console.log(`[seed] tables 1..20 (${tables} new)`);
}

/** CLI entry: `npm run seed [-- --wipe]` */
async function runCli() {
  await connectDb();
  console.log("[seed] connected");
  await seedDatabase({ wipe: process.argv.includes("--wipe") });
  await disconnectDb();
  console.log("[seed] done");
}

// Only auto-run when executed directly, not when imported.
if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  runCli().catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
}
