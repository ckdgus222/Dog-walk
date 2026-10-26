import Image from "next/image";
import person1 from "../../public/illustrations/walking-drawing/ui/person-1.png";
import person2 from "../../public/illustrations/walking-drawing/ui/person-2.png";
import person3 from "../../public/illustrations/walking-drawing/ui/person-3.png";
import person4 from "../../public/illustrations/walking-drawing/ui/person-4.png";
import person5 from "../../public/illustrations/walking-drawing/ui/person-5.png";
import person6 from "../../public/illustrations/walking-drawing/ui/person-6.png";
import person7 from "../../public/illustrations/walking-drawing/ui/person-7.png";
import person8 from "../../public/illustrations/walking-drawing/ui/person-8.png";
import uiStyles from "./ui.module.css";

const faces = [
  person1,
  person2,
  person3,
  person4,
  person5,
  person6,
  person7,
  person8,
];

// There are no profile photos, so the user id picks one of eight drawn faces
// and a person looks the same on every page.
export const personFaceIndex = (userId: number) =>
  (userId - 1) % faces.length;

// Decorative: the nickname is always written beside it.
export const PersonFace = ({
  userId,
  size,
  className = "",
}: {
  userId: number;
  size: 32 | 48 | 64;
  className?: string;
}) => (
  <Image
    className={`${uiStyles.face} ${uiStyles.person} ${className}`}
    src={faces[personFaceIndex(userId)]}
    alt=""
    width={size}
    height={size}
  />
);
