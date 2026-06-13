import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  {
    name: '招牌热菜',
    items: [
      ['麻婆豆腐', '豆腐嫩滑，牛肉末和花椒香气足', 2800, 'hot'],
      ['回锅肉', '蒜苗、二刀肉、郫县豆瓣的经典组合', 3800, 'hot'],
      ['宫保鸡丁', '糊辣荔枝口，花生香脆', 3600, 'hot'],
    ],
  },
  {
    name: '水煮系列',
    items: [
      ['水煮牛肉', '牛肉滑嫩，麻辣红油厚重', 5800, 'hot'],
      ['水煮鱼片', '鱼片鲜嫩，豆芽打底', 5600, 'hot'],
      ['水煮肉片', '家常高人气下饭菜', 4800, 'hot'],
    ],
  },
  {
    name: '干锅小炒',
    items: [
      ['干锅肥肠', '肥肠焦香，配菜入味', 6200, 'hot'],
      ['干锅花菜', '花菜脆嫩，五花肉增香', 3200, 'hot'],
      ['小炒黄牛肉', '香辣鲜嫩，下饭首选', 5800, 'hot'],
    ],
  },
  {
    name: '酸菜泡椒',
    items: [
      ['酸菜鱼', '酸爽开胃，鱼片细嫩', 6800, 'hot'],
      ['泡椒牛蛙', '泡椒香气足，微酸微辣', 7800, 'hot'],
      ['泡椒鸡杂', '脆嫩爽口，锅气明显', 4200, 'hot'],
    ],
  },
  {
    name: '凉菜卤味',
    items: [
      ['夫妻肺片', '红油浓香，麻辣鲜香', 4200, 'cold'],
      ['口水鸡', '鸡肉细嫩，红油复合香', 3800, 'cold'],
      ['蒜泥白肉', '薄片白肉配蒜泥红油', 3600, 'cold'],
    ],
  },
  {
    name: '素菜时蔬',
    items: [
      ['鱼香茄子', '酸甜微辣，茄子软糯', 3200, 'hot'],
      ['炝炒土豆丝', '爽脆清香，微辣开胃', 2200, 'hot'],
      ['清炒时蔬', '按当日新鲜蔬菜制作', 2600, 'hot'],
    ],
  },
  {
    name: '汤品',
    items: [
      ['番茄蛋花汤', '清爽家常，适合解辣', 1800, 'hot'],
      ['酸辣汤', '酸辣开胃，胡椒香明显', 2200, 'hot'],
      ['老鸭汤', '汤味醇厚，适合多人分享', 5800, 'hot'],
    ],
  },
  {
    name: '主食米饭',
    items: [
      ['米饭', '东北大米', 300, 'staple'],
      ['担担面', '芽菜肉臊，麻酱红油', 1800, 'staple'],
      ['红油抄手', '鲜肉抄手配红油汤底', 2200, 'staple'],
    ],
  },
  {
    name: '小吃点心',
    items: [
      ['钟水饺', '甜酱油红油风味', 1800, 'staple'],
      ['赖汤圆', '黑芝麻馅，软糯香甜', 1600, 'staple'],
      ['炸酥肉', '椒盐香脆，现炸上桌', 3200, 'hot'],
    ],
  },
  {
    name: '饮品',
    items: [
      ['冰粉', '红糖、花生、葡萄干', 1200, 'drink'],
      ['酸梅汤', '冰镇酸甜，解辣', 1000, 'drink'],
      ['豆奶', '经典瓶装豆奶', 800, 'drink'],
    ],
  },
  {
    name: '套餐推荐',
    items: [
      ['双人川味套餐', '含热菜、素菜、米饭和饮品', 9800, 'hot'],
      ['三人下饭套餐', '适合朋友聚餐的经典组合', 13800, 'hot'],
      ['四人招牌套餐', '招牌菜组合，适合家庭聚餐', 19800, 'hot'],
    ],
  },
] as const;

async function main() {
  await prisma.restaurant.upsert({
    where: { id: 'seed-restaurant-xidao' },
    update: {},
    create: {
      id: 'seed-restaurant-xidao',
      name: '系岛食堂',
      tables: {
        create: Array.from({ length: 11 }, (_, index) => {
          const tableNumber = index + 1;
          return {
            name: `A${String(tableNumber).padStart(2, '0')}`,
            code: `TABLE-${String(tableNumber).padStart(2, '0')}`,
            capacity: tableNumber <= 4 ? 2 : tableNumber <= 8 ? 4 : 6,
          };
        }),
      },
      users: {
        create: [
          {
            name: '店长',
            phone: '13800000000',
            passwordHash: 'replace-with-real-password-hash',
            role: 'owner',
          },
          {
            name: '厨房屏',
            phone: '13800000001',
            passwordHash: 'replace-with-real-password-hash',
            role: 'kitchen',
          },
        ],
      },
    },
  });

  for (const [categoryIndex, category] of categories.entries()) {
    await prisma.category.upsert({
      where: {
        id: `seed-category-${categoryIndex + 1}`,
      },
      update: {},
      create: {
        id: `seed-category-${categoryIndex + 1}`,
        restaurantId: 'seed-restaurant-xidao',
        name: category.name,
        sortOrder: categoryIndex + 1,
        menuItems: {
          create: category.items.map(([name, description, price, kitchenStation], itemIndex) => ({
            restaurantId: 'seed-restaurant-xidao',
            name,
            description,
            price,
            kitchenStation,
            sortOrder: itemIndex + 1,
            options: {
              create: [
                {
                  name: '辣度',
                  type: 'single',
                  required: false,
                  sortOrder: 1,
                  values: [
                    { name: '不辣', priceDelta: 0 },
                    { name: '微辣', priceDelta: 0 },
                    { name: '中辣', priceDelta: 0 },
                    { name: '特辣', priceDelta: 0 },
                  ],
                },
              ],
            },
          })),
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

