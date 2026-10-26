"use client";

import Link from "next/link";
import { AuthGate } from "../_components/auth-gate";
import { dangerButton, secondaryButton } from "../_components/buttons";
import { DogCard } from "../_components/dog-card";
import headingStyles from "../_components/heading.module.css";
import { InfoIcon, PlusIcon } from "../_components/icons";
import layoutStyles from "../_components/layout.module.css";
import uiStyles from "../_components/ui.module.css";
import { SceneImage } from "../_components/walk-scene";
import { useDeleteDog, useMyDogs } from "../../lib/api/dogs";
import type { Dog } from "../../lib/types";
import livingRoomMobile from "../../public/illustrations/walking-drawing/living-room-mobile.png";
import livingRoom from "../../public/illustrations/walking-drawing/living-room.png";
import styles from "./dogs.module.css";

const DogsPage = () => {
  return (
    <main
      className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.listPage}`}
    >
      <div className={layoutStyles.head}>
        <div>
          <h1 className={headingStyles.title}>내 반려견</h1>
          <p className={headingStyles.lead}>
            함께 산책하는 소중한 가족을 소개해 주세요.
          </p>
        </div>
        <Link href="/dogs/new" className={layoutStyles.headAction}>
          <PlusIcon />
          반려견 추가
        </Link>
      </div>
      <AuthGate>
        <DogList />
      </AuthGate>
      <SceneImage
        className={styles.livingRoom}
        wide={livingRoom}
        narrow={livingRoomMobile}
        narrowMedia="(max-width: 720px)"
        // As wide as the panel's content, a little narrower than the window.
        wideSizes="90vw"
        loading="lazy"
        fill
      />
    </main>
  );
};
export default DogsPage;

const DogList = () => {
  const query = useMyDogs();
  const remove = useDeleteDog();
  const error = remove.error?.message ?? query.error?.message;

  const removeDog = (dog: Dog) => {
    if (!window.confirm(`${dog.name}의 정보를 삭제할까요?`)) return;
    remove.mutate(dog.id);
  };

  return (
    <>
      {query.isPending && !error && (
        <p role="status">반려견을 불러오고 있어요.</p>
      )}
      <div className={styles.list}>
        {query.data?.map((dog, index) => (
          <DogCard
            key={dog.id}
            dog={dog}
            heading="h2"
            className={styles.card}
            order={index}
          >
            <div className={styles.actions}>
              <Link
                href={`/dogs/${dog.id}/edit`}
                className={secondaryButton}
              >
                수정
              </Link>
              <button
                type="button"
                className={dangerButton}
                disabled={remove.isPending}
                onClick={() => removeDog(dog)}
              >
                {remove.isPending && remove.variables === dog.id
                  ? "삭제 중…"
                  : "삭제"}
              </button>
            </div>
          </DogCard>
        ))}
      </div>
      {/* The bar always explains the one-dog rule, and shows the error in
          its place when something fails. */}
      {(error || query.isSuccess) && (
        <p
          key={error ? "error" : "hint"}
          role={error ? "alert" : undefined}
          className={uiStyles.notice}
        >
          <InfoIcon size={24} />
          {error || "반려견은 최소 한 마리 있어야 해요."}
        </p>
      )}
    </>
  );
};
