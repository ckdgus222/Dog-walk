"use client";

import layoutStyles from "../_components/layout.module.css";
import { SignupForm } from "../_components/signup-form";

const SignupPage = () => {
  return (
    <main className={layoutStyles.main}>
      <SignupForm
        onSuccess={() => {
          // A full navigation keeps the login route out of the modal slot.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/login");
        }}
      />
    </main>
  );
};
export default SignupPage;
