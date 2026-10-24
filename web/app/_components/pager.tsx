import Link from "next/link";
import { secondaryButton as pageButton } from "./buttons";
import { ArrowLeft, ArrowRight } from "./icons";
import styles from "./pager.module.css";

// Previous / "page of pages" / next under a paged list. A page past the end
// (after deletions, or a typed address) offers the last page instead.
export const Pager = ({
  label,
  page,
  totalPages,
  href,
  emptyText,
}: {
  label: string;
  page: number;
  totalPages: number;
  href: (page: number) => string;
  emptyText: string;
}) => {
  if (page > totalPages) {
    return (
      <>
        <p>{emptyText}</p>
        <Link href={href(totalPages)}>마지막 페이지로</Link>
      </>
    );
  }

  // An unusable step stays visible but is not a link.
  return (
    <nav aria-label={label} className={styles.pages}>
      {page > 1 ? (
        <Link href={href(page - 1)} className={pageButton}>
          <ArrowLeft />
          이전
        </Link>
      ) : (
        <span className={`${pageButton} ${styles.off}`}>
          <ArrowLeft />
          이전
        </span>
      )}
      <span>
        <strong>{page}</strong> / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className={pageButton}>
          다음
          <ArrowRight size={18} />
        </Link>
      ) : (
        <span className={`${pageButton} ${styles.off}`}>
          다음
          <ArrowRight size={18} />
        </span>
      )}
    </nav>
  );
};
