"use client";

import Image from "next/image";
import Link from "next/link";
import { useMyDogs } from "../lib/api/dogs";
import type { Dog } from "../lib/types";
import communityChat from "../public/illustrations/walking-drawing/community-chat.svg";
import diaryBook from "../public/illustrations/walking-drawing/diary-book.svg";
import { useAuth } from "./_components/auth-provider";
import { defaultDogFace, sizeLabels } from "./_components/dog-card";
import { ScenePage } from "./_components/walk-scene";
import styles from "./page.module.css";

const Home = () => {
  const { user, loading } = useAuth();

  return (
    <ScenePage className={styles.content}>
      {loading ? (
        <p role="status">로그인 상태를 확인하고 있어요.</p>
      ) : user ? (
        <Dashboard nickname={user.nickname} />
      ) : (
        <Welcome />
      )}
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

const Welcome = () => (
  <>
    <Title />
    <nav aria-label="계정" className={styles.actions}>
      <Link href="/login" className={styles.primaryAction}>
        로그인
      </Link>
      <Link href="/signup" className={styles.textAction}>
        회원가입
      </Link>
    </nav>
  </>
);

const Dashboard = ({ nickname }: { nickname: string }) => (
  <>
    <p className={styles.greeting}>{nickname}님, 안녕하세요</p>
    <Title />
    <div className={styles.actions}>
      <Link href="/map" className={styles.primaryAction}>
        주변 친구 찾기<span aria-hidden="true">→</span>
      </Link>
      <Link href="/walk-requests" className={styles.textAction}>
        산책 요청<span aria-hidden="true">→</span>
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
          width={72}
          height={72}
        />
        <p className={styles.description}>우리의 소중한 산책을 기록해요</p>
      </section>
      <section className={`${styles.card} ${styles.linkCard}`}>
        <CardTitle href="/posts">게시판</CardTitle>
        <Image
          className={styles.icon}
          src={communityChat}
          alt=""
          width={72}
          height={72}
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
    <span aria-hidden="true">›</span>
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
      {query.data.map((dog) => (
        <li key={dog.id} className={styles.dog}>
          <DogFace dog={dog} />
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

const DogFace = ({ dog }: { dog: Dog }) =>
  dog.photoUrl ? (
    // The web container cannot fetch nginx uploads for next/image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.face} src={dog.photoUrl} alt="" />
  ) : (
    <Image
      className={styles.face}
      src={defaultDogFace(dog)}
      alt=""
      width={80}
      height={80}
    />
  );
