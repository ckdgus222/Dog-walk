import { randomBytes } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as bcrypt from 'bcrypt';
import { PASSWORD_HASH_ROUNDS } from '../common/account-rules.js';
import { DEMO_EMAIL } from './demo.constants.js';
import {
  Prisma,
  type PrismaClient,
  type User,
  type Dog,
  type Post,
} from '../generated/prisma/client.js';

// Coordinates are already on LocationService's 0.002 storage grid.
const accounts = [
  {
    email: DEMO_EMAIL,
    nickname: '둘러보기',
    lat: 37.528,
    lng: 126.932,
  },
  {
    email: 'neighbor1@dogwalk.invalid',
    nickname: '강바람산책',
    lat: 37.53,
    lng: 126.934,
  },
  {
    email: 'neighbor2@dogwalk.invalid',
    nickname: '노을발자국',
    lat: 37.526,
    lng: 126.93,
  },
  {
    email: 'neighbor3@dogwalk.invalid',
    nickname: '풀잎쉼표',
    lat: 37.532,
    lng: 126.936,
  },
  {
    email: 'neighbor4@dogwalk.invalid',
    nickname: '물결따라',
    lat: 37.524,
    lng: 126.928,
  },
  {
    email: 'neighbor5@dogwalk.invalid',
    nickname: '아침둔치',
    lat: 37.528,
    lng: 126.938,
  },
];

const dogData = [
  {
    owner: 0,
    name: '콩이',
    photo: 'dog-kongi.webp',
    breed: '믹스',
    size: 'SMALL',
    gender: 'FEMALE',
    neutered: true,
    birthYear: 2022,
    personality: '처음에는 조심스럽지만 금방 친해져요.',
  },
  {
    owner: 1,
    name: '두부',
    photo: 'dog-dubu.webp',
    breed: '푸들',
    size: 'SMALL',
    gender: 'MALE',
    neutered: true,
    birthYear: 2020,
    personality: '친구와 나란히 걷는 걸 좋아해요.',
  },
  {
    owner: 1,
    name: '호두',
    photo: 'dog-hodu.webp',
    breed: '믹스',
    size: 'MEDIUM',
    gender: 'FEMALE',
    neutered: true,
    birthYear: 2019,
    personality: '느긋하게 냄새를 맡으며 걸어요.',
  },
  {
    owner: 2,
    name: '보리',
    photo: 'dog-bori.webp',
    breed: '리트리버',
    size: 'LARGE',
    gender: 'FEMALE',
    neutered: true,
    birthYear: 2021,
    personality: '사람을 좋아하고 활발해요.',
  },
  {
    owner: 3,
    name: '밤이',
    photo: 'dog-bami.webp',
    breed: '시바',
    size: 'MEDIUM',
    gender: 'MALE',
    neutered: false,
    birthYear: 2023,
    personality: '혼자 탐색하다 친구에게 다가가요.',
  },
  {
    owner: 3,
    name: '별이',
    photo: 'dog-byeoli.webp',
    breed: '믹스',
    size: 'SMALL',
    gender: 'FEMALE',
    neutered: true,
    birthYear: 2017,
    personality: '조용히 천천히 걷는 걸 좋아해요.',
  },
  {
    owner: 4,
    name: '구름',
    photo: 'dog-gureum.webp',
    breed: '믹스',
    size: 'LARGE',
    gender: 'MALE',
    neutered: true,
    birthYear: 2022,
    personality: '덩치는 크지만 겁이 조금 많아요.',
  },
  {
    owner: 5,
    name: '참깨',
    photo: 'dog-chamkkae.webp',
    breed: '비글',
    size: 'MEDIUM',
    gender: 'FEMALE',
    neutered: false,
    birthYear: 2024,
    personality: '새로운 길을 탐험하는 게 즐거워요.',
  },
  {
    owner: 5,
    name: '토리',
    photo: 'dog-tori.webp',
    breed: '푸들',
    size: 'SMALL',
    gender: 'MALE',
    neutered: true,
    birthYear: 2018,
    personality: '익숙한 길에서 편안하게 걸어요.',
  },
] satisfies (Omit<Prisma.DogCreateManyInput, 'ownerId'> & {
  owner: number;
  photo: string;
})[];

const diaryData = [
  { dog: 0, photos: ['diary-1a.webp', 'diary-1b.webp'] },
  { dog: 0, photos: ['diary-2a.webp', 'diary-2b.webp'] },
  { dog: 1, photos: [] },
  { dog: 3, photos: [] },
  { dog: 4, photos: [] },
  { dog: 6, photos: [] },
  { dog: 7, photos: [] },
];

export async function resetDemo(prisma: PrismaClient) {
  const publicDirectory = process.env.PUBLIC_UPLOAD_DIR;
  if (!publicDirectory) throw new Error('PUBLIC_UPLOAD_DIR is required');
  const privateDirectory = process.env.PRIVATE_UPLOAD_DIR;
  if (!privateDirectory) throw new Error('PRIVATE_UPLOAD_DIR is required');

  const photoSource = new URL('../../demo-photos/', import.meta.url);
  const dogDirectory = join(publicDirectory, 'dogs');
  const diaryDirectory = join(privateDirectory, 'diaries');
  await mkdir(dogDirectory, { recursive: true });
  await mkdir(diaryDirectory, { recursive: true });
  for (const { photo } of dogData) {
    await copyFile(
      new URL(photo, photoSource),
      join(dogDirectory, `demo-${photo}`),
    );
  }
  const diaryPhotos = diaryData.flatMap((diary) => diary.photos);
  for (const photo of diaryPhotos) {
    await copyFile(
      new URL(photo, photoSource),
      join(diaryDirectory, `demo-${photo}`),
    );
  }

  // Nobody knows these passwords, so demo users can't use ordinary login.
  // Hash outside the transaction to keep the locks short.
  const passwordHashes = await Promise.all(
    accounts.map(() =>
      bcrypt.hash(randomBytes(32).toString('hex'), PASSWORD_HASH_ROUNDS),
    ),
  );
  return prisma.$transaction(
    async (tx) => {
      const users: User[] = [];
      for (const [index, account] of accounts.entries()) {
        const user = await tx.user.upsert({
          where: { email: account.email },
          create: {
            email: account.email,
            nickname: account.nickname,
            isDemo: true,
            passwordHash: passwordHashes[index],
          },
          update: {},
        });
        if (!user.isDemo)
          throw new Error(
            `Demo email belongs to a real user: ${account.email}`,
          );
        users.push(user);
      }

      const userIds = users.map((user) => user.id);
      // FK inserts take KEY SHARE locks. Lock users before requests so writes
      // wait for the reset, including messages sent by a real conversation partner.
      await tx.$queryRaw`
        SELECT id FROM users WHERE id IN (${Prisma.join(userIds)}) ORDER BY id FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT id FROM walk_requests
        WHERE requester_id IN (${Prisma.join(userIds)}) OR receiver_id IN (${Prisma.join(userIds)})
        ORDER BY id FOR UPDATE
      `;

      const relatedRequests = {
        OR: [{ requesterId: { in: userIds } }, { receiverId: { in: userIds } }],
      };
      await tx.chatMessage.deleteMany({
        where: { walkRequest: relatedRequests },
      });
      await tx.walkRequest.deleteMany({ where: relatedRequests });
      await tx.diary.deleteMany({ where: { authorId: { in: userIds } } });
      await tx.comment.deleteMany({ where: { authorId: { in: userIds } } });
      await tx.post.deleteMany({ where: { authorId: { in: userIds } } });
      await tx.dog.deleteMany({ where: { ownerId: { in: userIds } } });

      const now = new Date();
      for (const [index, account] of accounts.entries()) {
        await tx.user.update({
          where: { id: users[index].id },
          data: {
            nickname: account.nickname,
            refreshTokenHash: null,
            locationConsentedAt: now,
            locationUpdatedAt: now,
          },
        });
        await tx.$executeRaw`
          UPDATE users SET location = ST_SetSRID(ST_MakePoint(${account.lng}, ${account.lat}), 4326)::geography
          WHERE id = ${users[index].id}
        `;
      }

      const dogs: Dog[] = [];
      for (const { owner, photo, ...dog } of dogData) {
        dogs.push(
          await tx.dog.create({
            data: {
              ...dog,
              ownerId: users[owner].id,
              photoUrl: `/uploads/dogs/demo-${photo}`,
            },
          }),
        );
      }

      const postData = [
        {
          author: 1,
          title: '강바람이 시원한 저녁이에요',
          content:
            '오늘은 물가에서 조금 떨어진 길로 천천히 걸었어요. 물과 배변 봉투도 챙겨 가세요.',
        },
        {
          author: 2,
          title: '노을 보며 쉬었다 왔어요',
          content:
            '걷다가 잠깐 쉬니 강아지도 편안해하네요. 붐비는 곳에서는 줄을 짧게 잡고 걸었어요.',
        },
        {
          author: 3,
          title: '천천히 걷는 친구도 반가워요',
          content:
            '냄새 맡는 시간이 긴 친구와 산책해요. 서로 속도를 맞추며 걸으면 좋겠어요.',
        },
        {
          author: 4,
          title: '산책 가방에 무엇을 챙기세요?',
          content:
            '물그릇과 배변 봉투, 작은 수건을 챙겨요. 가볍게 챙기는 팁이 있다면 나눠 주세요.',
        },
        {
          author: 5,
          title: '아침 산책을 시작했어요',
          content:
            '조용한 아침에 한 바퀴 걸으니 기분이 좋아요. 다른 강아지에게 인사하기 전에는 보호자에게 먼저 물어봐요.',
        },
      ];
      const posts: Post[] = [];
      for (const [index, { author, ...post }] of postData.entries()) {
        const createdAt = new Date(
          now.getTime() - (index + 1) * 12 * 60 * 60 * 1000,
        );
        posts.push(
          await tx.post.create({
            data: {
              ...post,
              authorId: users[author].id,
              createdAt,
              updatedAt: createdAt,
            },
          }),
        );
      }
      const comments = await tx.comment.createMany({
        data: [
          { post: 0, author: 2, content: '저희도 천천히 걷고 왔어요!' },
          { post: 1, author: 3, content: '쉬는 시간도 꼭 챙겨야겠어요.' },
          {
            post: 2,
            author: 4,
            content: '냄새 맡기 좋아하는 친구가 여기에도 있어요.',
          },
          { post: 3, author: 5, content: '작은 물그릇이 정말 편해요.' },
          {
            post: 4,
            author: 1,
            content: '먼저 물어보고 인사하는 습관 좋네요.',
          },
        ].map(({ post, author, content }) => {
          const createdAt = new Date(
            posts[post].createdAt.getTime() + 60 * 60 * 1000,
          );
          return {
            postId: posts[post].id,
            authorId: users[author].id,
            content,
            createdAt,
            updatedAt: createdAt,
          };
        }),
      });

      for (const [index, entry] of diaryData.entries()) {
        const dog = dogs[entry.dog];
        const createdAt = new Date(
          now.getTime() - (index + 1) * 24 * 60 * 60 * 1000,
        );
        await tx.diary.create({
          data: {
            authorId: dog.ownerId,
            dogId: dog.id,
            walkedOn: createdAt,
            title: index === 0 ? '강바람과 함께한 산책' : '천천히 걸은 하루',
            content: `오늘의 산책 친구는 ${dog.name}. 공원 길을 함께 걸으며 냄새도 맡고 물도 마시며 여유롭게 쉬었어요.`,
            createdAt,
            updatedAt: createdAt,
            images: {
              create: entry.photos.map((photo, sortOrder) => ({
                fileName: `demo-${photo}`,
                sortOrder,
              })),
            },
          },
        });
      }

      const accepted = await tx.walkRequest.create({
        data: {
          requesterId: users[0].id,
          receiverId: users[1].id,
          status: 'ACCEPTED',
          message: '천천히 함께 걸어 볼까요?',
          createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
          respondedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
        },
      });
      await tx.walkRequest.create({
        data: {
          requesterId: users[2].id,
          receiverId: users[0].id,
          status: 'PENDING',
          message: '강바람 쐬며 같이 산책해요!',
          createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        },
      });
      const chatMessages = await tx.chatMessage.createMany({
        data: [
          '안녕하세요! 산책 요청 반가워요.',
          '반가워요. 저희 강아지는 천천히 걷는 걸 좋아해요.',
          '좋아요. 서로 편한 속도로 걸어요.',
          '물과 배변 봉투 챙겨 갈게요.',
          '만나면 조금 떨어져서 인사부터 해요.',
          '네, 강아지들이 편안하게 만나요!',
        ].map((content, index) => ({
          walkRequestId: accepted.id,
          senderId: users[index % 2 === 0 ? 1 : 0].id,
          content,
          createdAt: new Date(now.getTime() - (240 - index * 10) * 60 * 1000),
        })),
      });

      return {
        users: users.length,
        dogs: dogs.length,
        posts: posts.length,
        comments: comments.count,
        diaries: diaryData.length,
        walkRequests: 2,
        chatMessages: chatMessages.count,
        dogPhotos: dogData.length,
        diaryImages: diaryPhotos.length,
      };
    },
    { timeout: 30_000 },
  );
}
