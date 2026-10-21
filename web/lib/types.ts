export interface Dog {
  id: number;
  name: string;
  breed: string;
  size: "SMALL" | "MEDIUM" | "LARGE";
  gender: "MALE" | "FEMALE";
  neutered: boolean;
  birthYear: number;
  personality: string;
  photoUrl: string | null;
  createdAt: string;
}

export type WalkRequest = {
  id: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELED";
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  counterpart: { id: number; nickname: string; dogs: Dog[] };
};

export type ChatMessage = {
  id: number;
  walkRequestId: number;
  senderId: number;
  senderNickname: string;
  content: string;
  createdAt: string;
};

export type ChatHistory = {
  counterpart: { id: number; nickname: string };
  messages: ChatMessage[];
};

export type MyLocation = {
  consented: boolean;
  lat: number | null;
  lng: number | null;
  updatedAt: string | null;
};
export type Neighbor = {
  userId: number;
  nickname: string;
  lat: number;
  lng: number;
  distanceM: number;
  dogs: Dog[];
};

export type Diary = {
  id: number;
  dog: { id: number; name: string };
  walkedOn: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  images: { id: number }[];
};
