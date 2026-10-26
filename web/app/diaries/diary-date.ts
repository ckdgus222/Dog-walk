const parts = (date: string) => date.split("-").map(Number);

// "2026. 10. 22." in the diary list, as in the list mockup.
export const formatListDate = (date: string) => {
  const [year, month, day] = parts(date);
  return `${year}. ${month}. ${day}.`;
};

// "2026.10.22" as the title of a diary, as in the detail mockup. It reads
// like a date stamp, so the month and day keep two digits.
export const formatTitleDate = (date: string) => date.replaceAll("-", ".");
