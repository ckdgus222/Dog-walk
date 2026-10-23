"use client";

import Image from "next/image";
import Link from "next/link";
import { useMyDogs } from "../lib/api/dogs";
import communityChat from "../public/illustrations/walking-drawing/community-chat.svg";
import diaryBook from "../public/illustrations/walking-drawing/diary-book.svg";
import homeScene from "../public/illustrations/walking-drawing/home-scene.png";
import homeSceneMobile from "../public/illustrations/walking-drawing/home-scene-mobile.png";
import { useAuth } from "./_components/auth-provider";
import { DogFace, sizeLabels } from "./_components/dog-card";
import { FieldScene } from "./_components/field-scene";
import {
  ArrowRight,
  BookIcon,
  ChatIcon,
  ChevronRight,
  PinLineIcon,
} from "./_components/icons";
import { LoginForm } from "./_components/login-form";
import { SceneImage, ScenePage } from "./_components/walk-scene";
import styles from "./page.module.css";

const Home = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className={styles.checking}>
        <p role="status">로그인 상태를 확인하고 있어요.</p>
      </main>
    );
  }
  if (!user) return <GuestHome />;

  return (
    <ScenePage
      className={styles.content}
      scene={
        <SceneImage
          wide={homeScene}
          narrow={homeSceneMobile}
          narrowMedia="(max-width: 720px)"
          wideSizes="(max-width: 1600px) 100vw, 1600px"
        />
      }
    >
      <Dashboard nickname={user.nickname} />
    </ScenePage>
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
    <FieldScene variant="home" />
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
    <p className={styles.greeting}>{nickname}님, 안녕하세요</p>
    <Title />
    <div className={styles.actions}>
      <Link href="/map" className={styles.primaryAction}>
        주변 친구 찾기
        <ArrowRight />
      </Link>
      <Link href="/walk-requests" className={styles.textAction}>
        산책 요청
        <ArrowRight />
      </Link>
    </div>
    <div className={styles.cards}>
      <section className={styles.card}>
        <CardTitle href="/dogs">내 반려견</CardTitle>
        <MyDogs />
      </section>
      <section className={`${styles.card} ${styles.linkCard}`}>
        <CardTitle href="/diaries">산책 일기</CardTitle>
        <Image
          className={styles.icon}
          src={diaryBook}
          alt=""
          width={96}
          height={96}
        />
        <p className={styles.description}>우리의 소중한 산책을 기록해요</p>
      </section>
      <section className={`${styles.card} ${styles.linkCard}`}>
        <CardTitle href="/posts">게시판</CardTitle>
        <Image
          className={styles.icon}
          src={communityChat}
          alt=""
          width={96}
          height={96}
        />
        <p className={styles.description}>이웃 반려인들과 이야기를 나눠요</p>
      </section>
    </div>
  </>
);

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
          <DogFace dog={dog} className={styles.face} size={80} order={index} />
          <div>
            <p className={styles.dogName}>{dog.name}</p>
            <p className={styles.dogMeta}>
              {dog.breed} · {sizeLabels[dog.size]} · {dog.birthYear}년생
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
};
