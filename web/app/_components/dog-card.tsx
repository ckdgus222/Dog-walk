import Image from "next/image";
import type { Dog } from "../../lib/types";
import dogBami from "../../public/illustrations/walking-drawing/dog-bami.png";
import dogDubu from "../../public/illustrations/walking-drawing/dog-dubu.png";

export const sizeLabels = { SMALL: "소형", MEDIUM: "중형", LARGE: "대형" };
export const genderLabels = { MALE: "수컷", FEMALE: "암컷" };

// A dog without an uploaded photo gets one of two drawn faces. My own dogs
// pass their place in my list, so the first is cream and the second brown as in
// the mockup; other people's dogs fall back to the id.
const defaultDogFace = (dog: Dog, order = dog.id) =>
  order % 2 === 0 ? dogDubu : dogBami;

// A round face for dog lists and headers: the uploaded photo, or the drawn face.
// Decorative, because the dog's name is always written beside it.
export const DogFace = ({
  dog,
  className,
  size,
  order,
}: {
  dog: Dog;
  className: string;
  size: number;
  order?: number;
}) =>
  dog.photoUrl ? (
    // The web container cannot fetch nginx uploads for next/image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={dog.photoUrl} alt="" />
  ) : (
    <Image
      className={className}
      src={defaultDogFace(dog, order)}
      alt=""
      width={size}
      height={size}
    />
  );

export const DogCard = ({
  dog,
  heading: Heading,
  className,
  order,
  children,
}: {
  dog: Dog;
  heading: "h2" | "h3";
  order?: number;
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
        src={defaultDogFace(dog, order)}
        alt="사진 없음"
        width={200}
        height={200}
      />
    )}
    <Heading>{dog.name}</Heading>
    {/* One line on wide screens; pages may break it after the gender. */}
    <p>
      <span>
        {dog.breed} · {sizeLabels[dog.size]} · {genderLabels[dog.gender]}
      </span>
      <span> · </span>
      <span>
        {dog.neutered ? "중성화" : "중성화 안 함"} · {dog.birthYear}년생
      </span>
    </p>
    <p>{dog.personality}</p>
    {children}
  </article>
);
