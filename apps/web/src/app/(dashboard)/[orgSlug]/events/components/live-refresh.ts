export type EventsViewParams = {
  page?: string;
  search?: string;
  eventName?: string;
  contactEmail?: string;
  dateFrom?: string;
  dateTo?: string;
  datePreset?: string;
};

/**
 * Whether this view may auto-refresh.
 *
 * Only the unfiltered first page. On any filtered or paginated view a refresh
 * reorders rows under a user who is reading them, and on a date-bounded view
 * new events do not belong in the result at all — so live updates would either
 * do nothing visible or actively mislead.
 */
export function canAutoRefresh(params: EventsViewParams): boolean {
  if (params.page !== undefined && params.page !== "" && params.page !== "1") {
    return false;
  }

  const filters = [
    params.search,
    params.eventName,
    params.contactEmail,
    params.dateFrom,
    params.dateTo,
    params.datePreset,
  ];

  return filters.every((value) => value === undefined || value === "");
}
