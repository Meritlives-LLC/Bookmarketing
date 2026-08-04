import { PrismaClient, BookGenre } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123', 12);

  const user = await prisma.user.upsert({
    where: { email: 'demo@bookmarketingos.com' },
    update: {},
    create: {
      email: 'demo@bookmarketingos.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Author',
      emailVerified: true,
      credits: 50,
    },
  });

  await prisma.book.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      userId: user.id,
      title: 'The Last Ember',
      description:
        'A morally grey mage must choose between saving her kingdom and the man she loves, in a world where magic is dying.',
      genre: BookGenre.FANTASY,
      price: 4.99,
    },
  });

  console.log('Seed complete:', user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
