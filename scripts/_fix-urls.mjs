import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const fix = (v) => v && v.startsWith('/uploads/') ? '/api' + v : v;

// Fix BusinessShop
const shops = await p.businessShop.findMany({ select: { id: true, logo: true, coverImage: true, shopPhotos: true } });
for (const s of shops) {
  const logo = fix(s.logo);
  const coverImage = fix(s.coverImage);
  const shopPhotos = (s.shopPhotos || []).map(fix);
  if (logo !== s.logo || coverImage !== s.coverImage || JSON.stringify(shopPhotos) !== JSON.stringify(s.shopPhotos)) {
    await p.businessShop.update({ where: { id: s.id }, data: { logo, coverImage, shopPhotos } });
    console.log('Fixed shop', s.id);
  }
}

// Fix Listing imageUrl / mediaUrls
const listings = await p.listing.findMany({ select: { id: true, imageUrl: true, mediaUrls: true } });
for (const l of listings) {
  const imageUrl = fix(l.imageUrl);
  const mediaUrls = (l.mediaUrls || []).map(fix);
  if (imageUrl !== l.imageUrl || JSON.stringify(mediaUrls) !== JSON.stringify(l.mediaUrls)) {
    await p.listing.update({ where: { id: l.id }, data: { imageUrl, mediaUrls } });
    console.log('Fixed listing', l.id);
  }
}

// Fix User avatarUrl
const profiles = await p.userProfile.findMany({ select: { id: true, avatarUrl: true } });
for (const pr of profiles) {
  const avatarUrl = fix(pr.avatarUrl);
  if (avatarUrl !== pr.avatarUrl) {
    await p.userProfile.update({ where: { id: pr.id }, data: { avatarUrl } });
    console.log('Fixed profile', pr.id);
  }
}

console.log('Done');
await p.$disconnect();
