"use client";
import { useState } from "react";
import {
  CalendarDays,
  MoreHorizontal,
  ArrowUpRight,
  Search,
  ArrowDownUp,
  Check,
  X,
  TriangleAlert,
  Info,
} from "lucide-react";
import { Avatar, EmptyState, StatusBadge } from "./ui";
import { dateRange } from "@/lib/format";
import type { LeaveRequest, LeaveStatus } from "@/lib/types";

export type RequestFilter = "ALL" | LeaveStatus;
export function RequestHistory({
  requests,
  manager = false,
  expanded = false,
  filter,
  onFilter,
  onSelect,
  onReview,
  onViewAll,
  onNewRequest,
}: {
  requests: LeaveRequest[];
  manager?: boolean;
  expanded?: boolean;
  filter: RequestFilter;
  onFilter: (filter: RequestFilter) => void;
  onSelect: (request: LeaveRequest) => void;
  onReview: (request: LeaveRequest, decision: "APPROVED" | "REJECTED") => void;
  onViewAll: () => void;
  onNewRequest: () => void;
}) {
  const [search, setSearch] = useState("");
  const [oldest, setOldest] = useState(false);
  const visible = requests
    .filter(
      (request) =>
        (filter === "ALL" || request.status === filter) &&
        `${request.reason ?? ""} ${request.employee.firstName} ${request.employee.lastName} ${request.startDate} ${request.endDate}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      oldest ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
    );
  const shown = expanded ? visible : visible.slice(0, 5);
  const filters: { value: RequestFilter; label: string }[] = [
    { value: "ALL", label: "All requests" },
    { value: "PENDING", label: "Pending" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
  ];
  return (
    <section className="panel history-panel" aria-label="Leave request history">
      <div className="panel-heading">
        <div>
          <h2>{manager ? "Your team’s requests" : "Your leave requests"}</h2>
          <p>
            {manager ? "A little coordination goes a long way." : "Every break, all in one place."}
          </p>
        </div>
        {!expanded && (
          <button className="text-button" onClick={onViewAll}>
            View all
            <ArrowUpRight size={15} />
          </button>
        )}
      </div>
      <div className="request-tabs" role="tablist" aria-label="Filter requests by status">
        {filters.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "active" : ""}
            onClick={() => onFilter(value)}
          >
            {label}
            <span>
              {value === "ALL"
                ? requests.length
                : requests.filter((request) => request.status === value).length}
            </span>
          </button>
        ))}
      </div>
      {expanded && (
        <div className="table-toolbar">
          <label className="search-input">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={manager ? "Search people or requests…" : "Search your requests…"}
              aria-label="Search requests"
            />
          </label>
          <button className="secondary-button small" onClick={() => setOldest(!oldest)}>
            <ArrowDownUp size={14} />
            {oldest ? "Oldest first" : "Newest first"}
          </button>
        </div>
      )}
      {shown.length ? (
        <div className="table-scroll">
          <table className={`request-table ${manager ? "manager-table" : ""}`}>
            <thead>
              <tr>
                {manager && <th>EMPLOYEE</th>}
                <th>LEAVE DATES</th>
                <th>DAYS</th>
                {!manager && <th className="reason-column">REASON</th>}
                <th>STATUS</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((request) => (
                <tr key={request.id}>
                  {manager && (
                    <td>
                      <button className="employee-cell" onClick={() => onSelect(request)}>
                        <Avatar person={request.employee} size="sm" />
                        <span>
                          <strong>
                            {request.employee.firstName} {request.employee.lastName}
                          </strong>
                          <small>{request.reason || request.employee.teamName}</small>
                        </span>
                      </button>
                    </td>
                  )}
                  <td>
                    <button className="date-cell" onClick={() => onSelect(request)}>
                      {!manager && (
                        <span className="date-icon">
                          <CalendarDays size={17} />
                        </span>
                      )}
                      <span>
                        <strong>{dateRange(request.startDate, request.endDate)}</strong>
                        <small>
                          {request.startDate.slice(0, 4) === request.endDate.slice(0, 4)
                            ? request.startDate.slice(0, 4)
                            : `${request.startDate.slice(0, 4)} – ${request.endDate.slice(0, 4)}`}{" "}
                          · Annual leave
                        </small>
                      </span>
                    </button>
                  </td>
                  <td className="days-cell">
                    {request.workingDays}
                    <span> {request.workingDays === 1 ? "day" : "days"}</span>
                  </td>
                  {!manager && (
                    <td className="reason-column">
                      <span className="reason-text" title={request.reason ?? ""}>
                        {request.reason || "—"}
                      </span>
                    </td>
                  )}
                  <td>
                    <div className="status-cell">
                      <StatusBadge status={request.status} />
                      {manager && request.teamWarning && request.status === "PENDING" && (
                        <button
                          className="warning-button"
                          title="More than 40% of your team is already away"
                          aria-label="View team availability warning"
                          onClick={() => onSelect(request)}
                        >
                          <TriangleAlert size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    {manager && request.status === "PENDING" ? (
                      <div className="review-actions">
                        <button
                          className="review-approve"
                          onClick={() => onReview(request, "APPROVED")}
                          title="Approve request"
                          aria-label={`Approve ${request.employee.firstName}'s request`}
                        >
                          <Check size={16} />
                        </button>
                        <button
                          className="review-reject"
                          onClick={() => onReview(request, "REJECTED")}
                          title="Reject request"
                          aria-label={`Reject ${request.employee.firstName}'s request`}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="icon-button more-button"
                        aria-label={`View request for ${dateRange(request.startDate, request.endDate)}`}
                        onClick={() => onSelect(request)}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={
            search
              ? "No matching requests"
              : filter === "ALL"
                ? "Your next break starts here."
                : `No ${filter.toLowerCase()} requests`
          }
          description={
            search
              ? "Try another name, date, or reason."
              : filter === "ALL"
                ? "Give yourself something to look forward to. Your requests will live here."
                : "You’re all caught up. Try another filter to see more requests."
          }
          action={
            filter === "ALL" && !manager ? (
              <button className="primary-button small" onClick={onNewRequest}>
                Request leave
              </button>
            ) : undefined
          }
        />
      )}
      <div className="table-footer">
        <span>
          Showing {shown.length} of {visible.length} requests
        </span>
        <span>
          <Info size={12} />
          Only working days count
        </span>
      </div>
    </section>
  );
}
