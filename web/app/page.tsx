"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useMyDogs } from "../lib/api/dogs";
import communityChat from "../public/illustrations/walking-drawing/community-chat.svg";
import diaryBook from "../public/illustrations/walking-drawing/diary-book.svg";
import homeSceneMobile from "../public/illustrations/walking-drawing/home-scene-mobile.png";
import homeScene from "../public/illustrations/walking-drawing/home-scene.png";
import { useAuth } from "./_components/auth-provider";
import { DogFace, sizeLabels } from "./_components/dog-card";
import { useFieldSceneDogs } from "./_components/field-scene";
import {
  ArrowRight,
  BookIcon,
  ChatIcon,
  ChevronRight,
  PinLineIcon,
} from "./_components/icons";
import layoutStyles from "./_components/layout.module.css";
import { LoginForm } from "./_components/login-form";
import { useNotifications } from "./_components/notifications-provider";
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
    <main className={layoutStyles.main}>
      <Dashboard nickname={user.nickname} />
    </main>
  );
};
export default Home;

const Title = () => (
  <h1 className={styles.title}>
    오늘도,
    <br />
    좋은 산책이 기다리고 있어요
  </h1>
);

const features = [
  {
    icon: <PinLineIcon />,
    name: "주변 산책 친구 찾기",
    detail: "가까운 반려인을 지도에서 찾아요",
  },
  {
    icon: <BookIcon />,
    name: "산책 일기",
    detail: "우리 아이와의 산책을 기록해요",
  },
  {
    icon: <ChatIcon size={24} />,
    name: "이웃 게시판",
    detail: "동네 반려인과 이야기를 나눠요",
  },
];

// Guests can only sign in or sign up, so their home introduces the service
// over the intro's field and asks them to log in.
const GuestHome = () => (
  <main>
    <div className={styles.guest}>
      <div className={styles.welcome}>
        <Title />
        <ul className={styles.features}>
          {features.map(({ icon, name, detail }) => (
            <li key={name}>
              {icon}
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
    </div>
  </main>
);

const Dashboard = ({ nickname }: { nickname: string }) => (
  <>
    <div className={styles.hero}>
      <div>
        <p className={styles.greeting}>{nickname}님, 안녕하세요</p>
        <Title />
        <div className={styles.actions}>
          <Link
            href="/map"
            className={`${uiStyles.button} ${uiStyles.primary}`}
          >
            주변 친구 찾기
            <ArrowRight />
          </Link>
          <Link href="/walk-requests" className={uiStyles.button}>
            산책 요청 보기
          </Link>
        </div>
      </div>
      {/* The drawing takes 7 of the hero's 12 columns above phone widths. */}
      <SceneImage
        wide={homeScene}
        narrow={homeSceneMobile}
        narrowMedia="(max-width: 720px)"
        wideSizes="(max-width: 1679px) 47vw, 810px"
      />
    </div>
    <div className={styles.cards}>
      <section className={`${uiStyles.card} ${styles.card}`}>
        <CardTitle href="/dogs">내 반려견</CardTitle>
        <MyDogs />
      </section>
      <section className={linkCardClass}>
        <CardTitle href="/walk-requests">산책 요청</CardTitle>
        <PendingCount />
      </section>
      <DrawingCard
        href="/diaries"
        title="산책 일기"
        drawing={diaryBook}
        text="우리의 소중한 산책을 기록해요"
      />
      <DrawingCard
        href="/posts"
        title="게시판"
        drawing={communityChat}
        text="이웃 반려인들과 이야기를 나눠요"
      />
    </div>
  </>
);

const linkCardClass = `${uiStyles.card} ${styles.card} ${styles.linkCard}`;

const DrawingCard = ({
  href,
  title,
  drawing,
  text,
}: {
  href: string;
  title: string;
  drawing: StaticImageData;
  text: string;
}) => (
  <section className={linkCardClass}>
    <CardTitle href={href}>{title}</CardTitle>
    <Image src={drawing} alt="" width={72} height={72} />
    <p className={uiStyles.meta}>{text}</p>
  </section>
);

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
// link name stays the card title.
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
  const query = useMyDogs();
  if (query.isPending) return <p role="status">반려견을 불러오고 있어요.</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  if (query.data.length === 0) {
    return <p className={styles.description}>아직 등록한 반려견이 없어요.</p>;
  }
  return (
    <ul className={styles.dogs}>
      {query.data.map((dog, index) => (
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
