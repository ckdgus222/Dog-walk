"use client";

import Image from "next/image";
import Link from "next/link";
import { useDiaries } from "../lib/api/diaries";
import { useMyDogs } from "../lib/api/dogs";
import { usePosts } from "../lib/api/posts";
import homeSceneMobile from "../public/illustrations/walking-drawing/home-scene-mobile.png";
import homeScene from "../public/illustrations/walking-drawing/home-scene.png";
import dogBami from "../public/illustrations/walking-drawing/dog-bami.png";
import dogDubu from "../public/illustrations/walking-drawing/dog-dubu.png";
import personFace from "../public/illustrations/walking-drawing/ui/person-2.png";
import { useAuth } from "./_components/auth-provider";
import { DogFace, sizeLabels } from "./_components/dog-card";
import { useFieldSceneDogs } from "./_components/field-scene";
import { ArrowRight, ChevronRight } from "./_components/icons";
import layoutStyles from "./_components/layout.module.css";
import { LoginForm } from "./_components/login-form";
import { useNotifications } from "./_components/notifications-provider";
import { DiaryImage } from "./diaries/diary-image";
import { formatListDate } from "./diaries/diary-date";
import uiStyles from "./_components/ui.module.css";
import { SceneImage } from "./_components/walk-scene";
import styles from "./page.module.css";

const Home = () => {
  const { user, loading } = useAuth();

  useFieldSceneDogs();

  if (loading) {
    return (
      <main className={layoutStyles.main}>
        <p role="status">로그인 상태를 확인하고 있어요.</p>
      </main>
    );
  }
  if (!user) return <GuestHome />;

  return (
    <main
      className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.dashboard}`}
    >
      <Dashboard nickname={user.nickname} />
    </main>
  );
};
export default Home;

const features = [
  {
    face: dogDubu,
    name: "주변 산책 친구 찾기",
    detail: "가까운 반려인을 지도에서 찾아요",
  },
  {
    face: dogBami,
    name: "산책 일기",
    detail: "우리 아이와의 산책을 기록해요",
  },
  {
    face: personFace,
    name: "이웃 게시판",
    detail: "동네 반려인과 이야기를 나눠요",
  },
];

// Guests can only sign in or sign up, so their home introduces the service
// over the intro's field and asks them to log in.
const GuestHome = () => (
  <main className={styles.guest}>
    <div className={styles.welcome}>
      <p className={styles.eyebrow}>우리 동네 반려견 산책 친구</p>
      <h1 className={styles.title}>
        오늘도,
        <br />
        좋은 산책이 기다리고 있어요
      </h1>
      <p className={styles.intro}>
        1km 안에서 함께 걸을 이웃을 찾고, 산책한 날은 사진과 함께 일기로
        남겨요.
      </p>
      <ul className={styles.features}>
        {features.map(({ face, name, detail }) => (
          <li key={name}>
            <Image
              src={face}
              alt=""
              width={48}
              height={48}
              className={uiStyles.face}
            />
            <strong>{name}</strong>
            <span>{detail}</span>
          </li>
        ))}
      </ul>
    </div>
    <section className={styles.loginCard}>
      {/* Logging in turns this same page into the dashboard. */}
      <LoginForm variant="card" onSuccess={() => {}} />
    </section>
    <RiverWalk />
  </main>
);

// The walk by the river stands on the bottom of the sheet and takes the
// height left above it, on both homes.
const RiverWalk = () => (
  <div className={styles.bottomScene}>
    <SceneImage
      wide={homeScene}
      narrow={homeSceneMobile}
      narrowMedia="(max-width: 720px)"
      // The drawing's width follows the height left for it, about 840px
      // at 1440x800 and 1400px at 1920x1080.
      wideSizes="70vw"
    />
  </div>
);

const Dashboard = ({ nickname }: { nickname: string }) => (
  <>
    <div className={styles.hero}>
      <div>
        <p className={styles.greeting}>{nickname}님, 안녕하세요</p>
        <h1 className={styles.title}>오늘도, 좋은 산책이 기다리고 있어요</h1>
      </div>
      <div className={styles.actions}>
        <Link href="/map" className={`${uiStyles.button} ${uiStyles.primary}`}>
          주변 친구 찾기
          <ArrowRight />
        </Link>
        <Link href="/walk-requests" className={uiStyles.button}>
          산책 요청 보기
        </Link>
      </div>
    </div>
    <div className={styles.cards}>
      <section className={cardClass}>
        <CardTitle href="/dogs">내 반려견</CardTitle>
        <MyDogs />
      </section>
      <section className={`${cardClass} ${styles.countCard}`}>
        <CardTitle href="/walk-requests">산책 요청</CardTitle>
        <PendingCount />
      </section>
      <section className={cardClass}>
        <CardTitle href="/diaries">산책 일기</CardTitle>
        <RecentDiary />
      </section>
      <section className={cardClass}>
        <CardTitle href="/posts">게시판</CardTitle>
        <NewPosts />
      </section>
    </div>
    <RiverWalk />
  </>
);

const cardClass = `${uiStyles.card} ${styles.card}`;

// The same count as the header badge. It reads 0 until the count arrives;
// a failed count shows a dash, and the header shows why.
const PendingCount = () => {
  const { pendingCount, pendingCountError } = useNotifications();
  return (
    <>
      <p className={styles.count}>{pendingCountError ? "–" : pendingCount}</p>
      <p className={uiStyles.meta}>새로 받은 요청</p>
    </>
  );
};

// The link stretches over its card, so the whole card is clickable while the
// link name stays the card title. Links inside a card sit above it.
const CardTitle = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <h2 className={styles.cardTitle}>
    <Link href={href} className={styles.cardLink}>
      {children}
    </Link>
    <ChevronRight />
  </h2>
);

const MyDogs = () => {
  const myDogs = useMyDogs();
  if (myDogs.isPending) return <p role="status">반려견을 불러오고 있어요.</p>;
  if (myDogs.isError) return <p role="alert">{myDogs.error.message}</p>;
  if (myDogs.data.length === 0) {
    return <p className={uiStyles.meta}>아직 등록한 반려견이 없어요.</p>;
  }
  return (
    <ul className={styles.dogs}>
      {myDogs.data.map((dog, index) => (
        <li key={dog.id} className={styles.dog}>
          <DogFace
            dog={dog}
            className={uiStyles.face}
            size={64}
            order={index}
          />
          <div>
            <p className={styles.dogName}>{dog.name}</p>
            <p className={uiStyles.meta}>
              {dog.breed} · {sizeLabels[dog.size]} · {dog.birthYear}년생
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
};

// The latest diary on the first page of the diary list (shared cache).
const RecentDiary = () => {
  const diaries = useDiaries(undefined, 1);
  if (diaries.isPending) return <p role="status">일기를 불러오고 있어요.</p>;
  if (diaries.isError) return <p role="alert">{diaries.error.message}</p>;
  const diary = diaries.data.diaries[0];
  if (!diary) {
    return (
      <p className={uiStyles.meta}>
        첫 산책을 기록해 보세요.{" "}
        <Link href="/diaries/new" className={styles.inner}>
          일기 쓰기
        </Link>
      </p>
    );
  }
  const [photo] = diary.images;
  return (
    <Link href={`/diaries/${diary.id}`} className={`${styles.inner} ${styles.recent}`}>
      {photo && (
        <span className={styles.recentPhoto}>
          <DiaryImage
            diaryId={diary.id}
            imageId={photo.id}
            alt=""
            className=""
          />
        </span>
      )}
      <span>
        <strong>{diary.title}</strong>
        <span className={uiStyles.meta}>
          {diary.dog.name} · {formatListDate(diary.walkedOn)}
        </span>
      </span>
    </Link>
  );
};

// The three newest posts on the first page of the board (shared cache).
const NewPosts = () => {
  const posts = usePosts(1);
  if (posts.isPending) return <p role="status">글을 불러오고 있어요.</p>;
  if (posts.isError) return <p role="alert">{posts.error.message}</p>;
  const newest = posts.data.posts.slice(0, 3);
  if (newest.length === 0) {
    return <p className={uiStyles.meta}>아직 글이 없어요.</p>;
  }
  return (
    <ul className={styles.newPosts}>
      {newest.map((post) => (
        <li key={post.id}>
          <Link href={`/posts/${post.id}`} className={styles.inner}>
            {post.title}
          </Link>
          <span className={uiStyles.meta}>{post.author.nickname}</span>
        </li>
      ))}
    </ul>
  );
};
