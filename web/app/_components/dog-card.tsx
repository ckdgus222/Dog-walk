import Image from "next/image";
import type { Dog } from "../../lib/types";
import dogBami from "../../public/illustrations/walking-drawing/dog-bami.png";
import dogDubu from "../../public/illustrations/walking-drawing/dog-dubu.png";

export const sizeLabels = { SMALL: "소형", MEDIUM: "중형", LARGE: "대형" };
export const genderLabels = { MALE: "수컷", FEMALE: "암컷" };

// A dog without an uploaded photo gets one of two drawn faces, chosen by id so
// the same dog shows the same face on every page.
const defaultDogFace = (dog: Dog) =>
  dog.id % 2 === 0 ? dogDubu : dogBami;

// A round face for dog lists and headers: the uploaded photo, or the drawn face.
// Decorative, because the dog's name is always written beside it.
export const DogFace = ({
  dog,
  className,
  size,
}: {
  dog: Dog;
  className: string;
  size: number;
}) =>
  dog.photoUrl ? (
    // The web container cannot fetch nginx uploads for next/image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={dog.photoUrl} alt="" />
  ) : (
    <Image
      className={className}
      src={defaultDogFace(dog)}
      alt=""
      width={size}
      height={size}
    />
  );

export const DogCard = ({
  dog,
  heading: Heading,
  className,
  children,
}: {
  dog: Dog;
  heading: "h2" | "h3";
  // Each page lays the card out itself, styling its parts by element.
  className: string;
  children?: React.ReactNode;
}) => (
  <article className={className}>
    {dog.photoUrl ? (
      // The web container cannot fetch nginx uploads for next/image optimization.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={dog.photoUrl} alt={`${dog.name} 사진`} />
    ) : (
      <Image
        src={defaultDogFace(dog)}
        alt="사진 없음"
        width={200}
        height={200}
      />
    )}
    <Heading>{dog.name}</Heading>
    <p>
      {dog.breed} · {sizeLabels[dog.size]} · {genderLabels[dog.gender]}
    </p>
    <p>
      {dog.neutered ? "중성화했어요" : "중성화하지 않았어요"} ·{" "}
      {dog.birthYear}년생
    </p>
    <p>{dog.personality}</p>
    {children}
  </article>
);
