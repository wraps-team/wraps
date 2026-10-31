"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { X } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import {
  type ListAddressesToReviewResult,
  listAddressesToReview,
  type ReviewList,
  type ReviewRow,
} from "@/actions/address-review";
import { Button } from "@/components/ui/button";
import { UnderlineTabs } from "@/components/underline-tabs";
import { browserTimeZone } from "@/lib/analytics-drilldown-window";
import { AddressDetailSheet } from "../../components/address-detail-sheet";
import { useDeliverabilityDays } from "../lib/params";
import {
  ADDRESSES_TO_REVIEW_ID,
  REVIEW_LISTS,
  type ReviewListParam,
  reviewListParser,
  reviewReasonParser,
} from "../lib/review-params";
import { ReviewTable } from "./review-table";
import {
  SuppressConfirmDialog,
  type SuppressTarget,
} from "./suppress-confirm-dialog";
import { SuppressedTab } from "./suppressed-tab";

/** Matches the server's REVIEW_PAGE_SIZE: each Load more asks for the next 25. */
const PAGE_SIZE = 25;

/** The copy for each list's empty state. Recommendations is handled apart. */
const EMPTY_COPY: Record<Exclude<ReviewList, "recommended">, string> = {
  soft: "No soft bounces in this range.",
  hard: "No hard bounces in this range.",
  complaint: "No complaints in this range.",
};

/** The empty copy when a reason from the Bounces card narrows the list. */
const REASON_EMPTY_COPY: Record<"soft" | "hard", string> = {
  soft: "No addresses to review for this reason. Bounces about the message itself (its size, content or attachments) don't count against the address.",
  hard: "No hard-bounced addresses for this reason in this range.",
};

const TAB_LABEL: Record<ReviewListParam, string> = {
  recommended: "Recommendations",
  soft: "Soft bounces",
  hard: "Hard bounces",
  complaint: "Complaints",
  suppressed: "Suppressed",
};

type AccountOption = { id: string; name: string; region: string };

type AddressesToReviewProps = {
  organizationId: string;
  orgSlug: string;
  accounts: AccountOption[];
};

type Counts = { soft: number; hard: number; complaint: number };

function isReviewListParam(value: string): value is ReviewListParam {
  return (REVIEW_LISTS as readonly string[]).includes(value);
}

/** Null until mounted: the server render must not carry the server's zone. */
function useTimeZone(): string | null {
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => {
    setTz(browserTimeZone());
  }, []);
  return tz;
}

/**
 * The "Addresses to review" panel under the deliverability card. Each tab is a
 * list of the addresses behind the numbers, and Suppress goes through a
 * confirmation. The open address lives in client state, never in the URL.
 */
export function AddressesToReview({
  organizationId,
  orgSlug,
  accounts,
}: AddressesToReviewProps) {
  const [list, setList] = useQueryState("list", reviewListParser);
  const [reasonParam, setReason] = useQueryState("reason", reviewReasonParser);
  const days = useDeliverabilityDays();
  const tz = useTimeZone();
  const queryClient = useQueryClient();

  const [counts, setCounts] = useState<Counts | null>(null);
  const [recommendedCount, setRecommendedCount] = useState<number | null>(null);
  const [selected, setSelected] = useState<ReviewRow | null>(null);
  const [confirm, setConfirm] = useState<SuppressTarget[] | null>(null);
  const [suppressedThisSession, setSuppressedThisSession] = useState(false);
  const [suppressedVersion, setSuppressedVersion] = useState(0);

  // The Suppressed tab loads its own data, so no review query runs for it.
  const reviewList: ReviewList | null = list === "suppressed" ? null : list;
  // A reason narrows only the bounce lists.
  const reason =
    reasonParam && (list === "soft" || list === "hard") ? reasonParam : null;

  const reviewQuery = useInfiniteQuery({
    queryKey: ["address-review", organizationId, reviewList, reason, days, tz],
    queryFn: ({ pageParam }) =>
      listAddressesToReview(organizationId, {
        list: reviewList ?? "recommended",
        days,
        tz: tz ?? "UTC",
        offset: pageParam,
        reason,
      }),
    initialPageParam: 0,
    // Recommendations has no continuation offset on the server, so it shows
    // one page and says so instead of offering Load more.
    getNextPageParam: (last, _pages, lastOffset) =>
      reviewList !== null &&
      reviewList !== "recommended" &&
      last.success &&
      last.hasMore
        ? lastOffset + PAGE_SIZE
        : undefined,
    enabled: reviewList !== null && tz !== null,
    staleTime: 60_000,
  });

  const pages: ListAddressesToReviewResult[] = reviewQuery.data?.pages ?? [];
  const failedPage = pages.find((page) => !page.success);
  const rows = pages.flatMap((page) => (page.success ? page.rows : []));
  const lastPage = pages.at(-1);
  const hasMore = lastPage?.success === true && lastPage.hasMore;

  // Counts come from whichever review list last loaded, so the tab labels
  // show them once Recommendations has loaded, without fetching the others.
  // Recommendations is a single page, so its first page holds every row.
  const firstPage = pages[0];
  useEffect(() => {
    if (firstPage?.success) {
      setCounts(firstPage.counts);
      if (reviewList === "recommended") {
        setRecommendedCount(firstPage.rows.length);
      }
    }
  }, [firstPage, reviewList]);

  const pendingRecommended = rows.filter((row) => row.status !== "listed");

  /** Null where no count is known: Suppressed never shows one. */
  const countFor = (option: ReviewListParam): number | null => {
    if (option === "recommended") {
      return recommendedCount;
    }
    if (option === "suppressed" || counts === null) {
      return null;
    }
    return counts[option];
  };

  const openConfirm = (targets: SuppressTarget[]) => {
    setConfirm(targets);
  };

  const afterSuppressed = (added: number) => {
    if (added > 0) {
      setSuppressedThisSession(true);
      setSuppressedVersion((version) => version + 1);
    }
    queryClient.invalidateQueries({
      queryKey: ["address-review", organizationId],
    });
  };

  const handleConfirmDone = (result: { added: number; failed: number }) => {
    afterSuppressed(result.added);
    if (result.failed === 0) {
      setConfirm(null);
    }
  };

  const recommendedEmptyCopy =
    suppressedThisSession ||
    (rows.length > 0 && pendingRecommended.length === 0)
      ? "Nothing left to suppress. SES is covering your problem addresses."
      : "Nothing to suppress right now. Addresses that complained, hard bounced, or kept soft bouncing show up here.";

  const renderBody = () => {
    if (list === "suppressed") {
      return (
        <SuppressedTab
          accounts={accounts}
          organizationId={organizationId}
          orgSlug={orgSlug}
          refreshKey={suppressedVersion}
        />
      );
    }

    if (reviewQuery.isPending || tz === null) {
      return (
        <div className="flex flex-col gap-3" data-testid="review-loading">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }

    const failure = failureText(reviewQuery.isError, failedPage);

    return (
      <div className="space-y-4">
        {reason !== null ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Bounced for</span>
            <span className="inline-flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 pr-1 pl-2">
              {reason}
              <button
                aria-label={`Clear the ${reason} filter`}
                className="inline-flex size-5 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setReason(null)}
                type="button"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          </div>
        ) : null}

        {list === "recommended" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {pendingRecommended.length > 0
                ? `${pendingRecommended.length} addresses SES is not suppressing yet`
                : ""}
            </p>
            <Button
              disabled={pendingRecommended.length === 0}
              onClick={() => openConfirm(toTargets(pendingRecommended))}
              variant="brand"
            >
              {pendingRecommended.length > 0
                ? `Suppress all ${pendingRecommended.length}`
                : "Suppress all"}
            </Button>
          </div>
        ) : null}

        {failure ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">{failure}</p>
            <Button
              onClick={() => reviewQuery.refetch()}
              size="sm"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        ) : null}

        {rows.length === 0 && !failure ? (
          <p className="text-muted-foreground text-sm">
            {emptyCopy(list, reason, recommendedEmptyCopy)}
          </p>
        ) : null}

        {rows.length > 0 ? (
          <>
            {list === "recommended" &&
            rows.length > 0 &&
            pendingRecommended.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {recommendedEmptyCopy}
              </p>
            ) : null}
            <ReviewTable
              list={reviewList ?? "recommended"}
              onOpen={(row) => setSelected(row)}
              onSuppress={(row) =>
                openConfirm([
                  {
                    address: row.address,
                    reason: row.reasonToSuppress,
                    awsAccountId: row.awsAccountId,
                  },
                ])
              }
              rows={rows}
            />
          </>
        ) : null}

        {list === "recommended" && hasMore ? (
          <p className="text-muted-foreground text-sm">
            Showing the first {PAGE_SIZE}. Suppress these to see more.
          </p>
        ) : null}

        {list !== "recommended" && hasMore ? (
          <div className="flex justify-center">
            <Button
              disabled={reviewQuery.isFetchingNextPage}
              onClick={() => reviewQuery.fetchNextPage()}
              variant="outline"
            >
              {reviewQuery.isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="scroll-mt-6 space-y-4" id={ADDRESSES_TO_REVIEW_ID}>
      <div className="space-y-1">
        <h2 className="font-semibold text-lg">Addresses to review</h2>
        <p className="text-muted-foreground text-sm">
          Who is behind the numbers above, and who SES should stop sending to.
        </p>
      </div>

      <UnderlineTabs
        label="Review lists"
        onValueChange={(value) => {
          if (isReviewListParam(value)) {
            setList(value);
            setReason(null);
          }
        }}
        tabs={REVIEW_LISTS.map((option) => ({
          value: option,
          label: TAB_LABEL[option],
          count: countFor(option),
          countVariant:
            option === "recommended" && (countFor(option) ?? 0) > 0
              ? "warning"
              : "secondary",
        }))}
        value={list}
      />

      {renderBody()}

      {confirm ? (
        <SuppressConfirmDialog
          accounts={accounts}
          onDone={handleConfirmDone}
          onOpenChange={(next) => {
            if (!next) {
              setConfirm(null);
            }
          }}
          open
          organizationId={organizationId}
          targets={confirm}
        />
      ) : null}

      {selected ? (
        <AddressDetailSheet
          accounts={accounts}
          address={selected.address}
          key={selected.address}
          listedState={selected.status}
          onClose={() => setSelected(null)}
          onSuppressed={() => afterSuppressed(1)}
          organizationId={organizationId}
          orgSlug={orgSlug}
          suppression={null}
          suppressTarget={{
            awsAccountId: selected.awsAccountId,
            reason: selected.reasonToSuppress,
          }}
        />
      ) : null}
    </section>
  );
}

function emptyCopy(
  list: ReviewList,
  reason: string | null,
  recommendedEmptyCopy: string
): string {
  if (list === "recommended") {
    return recommendedEmptyCopy;
  }
  if (reason !== null && (list === "soft" || list === "hard")) {
    return REASON_EMPTY_COPY[list];
  }
  return EMPTY_COPY[list];
}

/** The message for a failed load, or null when the lists loaded. */
function failureText(
  isError: boolean,
  failedPage: ListAddressesToReviewResult | undefined
): string | null {
  if (isError) {
    return "Could not load addresses. Try again.";
  }
  if (failedPage && !failedPage.success) {
    return failedPage.error;
  }
  return null;
}

function toTargets(rows: ReviewRow[]): SuppressTarget[] {
  return rows.map((row) => ({
    address: row.address,
    reason: row.reasonToSuppress,
    awsAccountId: row.awsAccountId,
  }));
}
