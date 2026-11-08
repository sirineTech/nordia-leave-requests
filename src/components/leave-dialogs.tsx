"use client";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  Leaf,
  LoaderCircle,
  MessageSquare,
  ShieldCheck,
  TriangleAlert,
  X,
  BookOpen,
  CircleHelp,
} from "lucide-react";
import { api, identity, errorMessage, errorFields } from "@/lib/client-api";
import { countWorkingDays } from "@/lib/leave-rules";
import { createLeaveSchema } from "@/lib/validation";
import { dateRange, formatDate } from "@/lib/format";
import type { Balance, Employee, LeaveRequest } from "@/lib/types";
import { Avatar, Modal, StatusBadge } from "./ui";

export function RequestDialog({
  user,
  manager,
  balance,
  onClose,
  onSuccess,
}: {
  user: Employee;
  manager?: Employee;
  balance: Balance;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const days = useMemo(() => {
    try {
      return startDate && endDate ? countWorkingDays(startDate, endDate) : 0;
    } catch {
      return 0;
    }
  }, [startDate, endDate]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setFields({});
    const parsed = createLeaveSchema.safeParse({ startDate, endDate, reason });
    if (!parsed.success) {
      setFields(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
        ),
      );
      return;
    }
    if (endDate < startDate) {
      setFields({ endDate: "End date must be on or after the start date." });
      return;
    }
    if (!days) {
      setError("Choose a date range with at least one working day (Monday–Friday).");
      return;
    }
    setBusy(true);
    try {
      await api.post("/leave-requests", parsed.data, identity(user.id));
      onSuccess();
    } catch (err) {
      setError(errorMessage(err));
      setFields(errorFields(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Request leave"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-header">
        <span className="modal-hero-icon">
          <Leaf size={25} strokeWidth={1.5} />
        </span>
        <span className="eyebrow">MAKE TIME FOR YOU</span>
        <h2>A little time off.</h2>
        <p>Something to look forward to. Let’s get it on the calendar.</p>
      </div>
      <div className="form-balance">
        <div>
          <span className="tiny-dot green" />
          <strong>{balance.available} days</strong> available to request
        </div>
        <span>{balance.year} allowance</span>
      </div>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="start-date">
              Start date <span>*</span>
            </label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setFields((old) => ({ ...old, startDate: "" }));
              }}
              aria-invalid={!!fields.startDate}
              aria-describedby={fields.startDate ? "start-error" : undefined}
              required
            />
            {fields.startDate && (
              <small id="start-error" className="field-error">
                {fields.startDate}
              </small>
            )}
          </div>
          <div className="field">
            <label htmlFor="end-date">
              End date <span>*</span>
            </label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setFields((old) => ({ ...old, endDate: "" }));
              }}
              aria-invalid={!!fields.endDate}
              aria-describedby={fields.endDate ? "end-error" : undefined}
              required
            />
            {fields.endDate && (
              <small id="end-error" className="field-error">
                {fields.endDate}
              </small>
            )}
          </div>
        </div>
        {days > 0 && (
          <div className="days-preview">
            <CalendarDays size={17} />
            <strong>
              {days} working {days === 1 ? "day" : "days"}
            </strong>
            <span>Weekends are on us.</span>
          </div>
        )}
        <div className="field reason-field">
          <label htmlFor="leave-reason">
            Reason <span className="optional">Optional</span>
          </label>
          <textarea
            id="leave-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={4}
            placeholder="A little adventure, family time, or simply a pause…"
          />
          <div className="field-helper">
            <span>Only you and your assigned manager can see this.</span>
            <span>{reason.length}/500</span>
          </div>
          {fields.reason && <small className="field-error">{fields.reason}</small>}
        </div>
        <div className="form-info">
          <ShieldCheck size={17} />
          <p>
            {manager ? (
              <>
                Your request goes directly to{" "}
                <strong>
                  {manager.firstName} {manager.lastName}
                </strong>{" "}
                (ID {manager.id}).{" "}
              </>
            ) : (
              <>Your assigned manager will review your request. </>
            )}
            Pending days are reserved from your available balance. Cross-year requests use each
            year’s allowance.
          </p>
        </div>
        {error && (
          <div className="error-message" role="alert">
            <TriangleAlert size={17} />
            <span>{error}</span>
          </div>
        )}
        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Maybe later
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : null}
            {busy ? "Sending request…" : "Send request"}
            {!busy && <ArrowRight size={16} />}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function TeamWarning({ request }: { request: LeaveRequest }) {
  if (!request.teamWarning) return null;
  const first = request.warningDays[0];
  return (
    <div className="warning-note">
      <TriangleAlert size={19} />
      <div>
        <strong>A heads-up for your team</strong>
        <p>
          {first
            ? `${first.away} of ${first.total} teammates (${first.percentage}%) are already away on ${request.warningDays
                .slice(0, 3)
                .map((day) => formatDate(day.date))
                .join(
                  ", ",
                )}${request.warningDays.length > 3 ? ` and ${request.warningDays.length - 3} more days` : ""}.`
            : "More than 40% of the team may already be away during these dates."}{" "}
          You can still approve this request.
        </p>
        <small>Only approved leave is counted, not pending requests.</small>
      </div>
    </div>
  );
}
export function RequestDetailDialog({
  request,
  manager,
  onClose,
  onReview,
}: {
  request: LeaveRequest;
  manager: boolean;
  onClose: () => void;
  onReview: (request: LeaveRequest, decision: "APPROVED" | "REJECTED") => void;
}) {
  return (
    <Modal title="Leave request details" onClose={onClose}>
      <div className="modal-header">
        <span className="modal-hero-icon">
          <CalendarDays size={25} strokeWidth={1.5} />
        </span>
        <span className="eyebrow">A MOMENT FOR YOURSELF</span>
        <h2>Leave request details</h2>
        <p>All the details, in one place.</p>
      </div>
      <div className="detail-person">
        <Avatar person={request.employee} />
        <div>
          <strong>
            {request.employee.firstName} {request.employee.lastName}
          </strong>
          <span>{request.employee.teamName}</span>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <div className="detail-dates">
        <div>
          <span>LEAVE DATES</span>
          <strong>
            {dateRange(request.startDate, request.endDate)}, {request.endDate.slice(0, 4)}
          </strong>
        </div>
        <div>
          <span>DURATION</span>
          <strong>
            {request.workingDays} working {request.workingDays === 1 ? "day" : "days"}
          </strong>
        </div>
      </div>
      <div className="detail-section">
        <h3>Reason for leave</h3>
        <p>{request.reason || "No reason provided. A little rest needs no explanation."}</p>
      </div>
      {request.managerComment && (
        <div className="manager-comment">
          <MessageSquare size={18} />
          <div>
            <h3>Your manager’s note</h3>
            <p>{request.managerComment}</p>
          </div>
        </div>
      )}
      {manager && request.status === "PENDING" && <TeamWarning request={request} />}
      <div className="detail-submitted">
        <Clock3 size={14} />
        Requested on{" "}
        {formatDate(request.createdAt, { month: "long", day: "numeric", year: "numeric" })}
      </div>
      <div className="modal-footer">
        {manager && request.status === "PENDING" ? (
          <>
            <button className="danger-button" onClick={() => onReview(request, "REJECTED")}>
              <X size={16} />
              Reject request
            </button>
            <button className="primary-button" onClick={() => onReview(request, "APPROVED")}>
              <Check size={16} />
              Approve request
            </button>
          </>
        ) : (
          <button className="primary-button" onClick={onClose}>
            Got it
            <Check size={16} />
          </button>
        )}
      </div>
    </Modal>
  );
}
export function ReviewDialog({
  request,
  decision,
  user,
  onClose,
  onSuccess,
}: {
  request: LeaveRequest;
  decision: "APPROVED" | "REJECTED";
  user: Employee;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const approve = decision === "APPROVED";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!approve && !comment.trim()) {
      setError("Please add a comment so your teammate understands the decision.");
      return;
    }
    setBusy(true);
    try {
      await api.patch(
        `/leave-requests/${request.id}/${approve ? "approve" : "reject"}`,
        { comment },
        identity(user.id),
      );
      onSuccess();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={approve ? "Approve leave request" : "Reject leave request"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-header">
        <span className={`modal-hero-icon ${!approve ? "red" : ""}`}>
          {approve ? <CircleCheck size={25} /> : <X size={25} />}
        </span>
        <span className="eyebrow">A LITTLE COORDINATION</span>
        <h2>{approve ? "Give their break the green light." : "Let’s leave a helpful note."}</h2>
        <p>
          {approve
            ? "A well-deserved pause is one approval away."
            : "A little context makes all the difference."}
        </p>
      </div>
      <div className="detail-person">
        <Avatar person={request.employee} />
        <div>
          <strong>
            {request.employee.firstName} {request.employee.lastName}
          </strong>
          <span>
            {request.employee.teamName} · {dateRange(request.startDate, request.endDate)} ·{" "}
            {request.workingDays} days
          </span>
        </div>
      </div>
      <div className="review-reason">“{request.reason || "Annual leave"}”</div>
      <TeamWarning request={request} />
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="manager-comment">
            Your comment <span className="optional">{approve ? "Optional" : "Required"}</span>
          </label>
          <textarea
            id="manager-comment"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={1000}
            placeholder={
              approve
                ? "Enjoy your well-deserved break!"
                : "Help your teammate understand your decision…"
            }
            required={!approve}
          />
        </div>
        {error && (
          <div className="error-message" role="alert">
            <TriangleAlert size={17} />
            <span>{error}</span>
          </div>
        )}
        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            Go back
          </button>
          <button className={approve ? "primary-button" : "danger-button solid"} disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : approve ? (
              <Check size={16} />
            ) : (
              <X size={16} />
            )}
            {busy ? "Saving decision…" : approve ? "Approve request" : "Reject request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PolicyDialog({ onClose }: { onClose: () => void }) {
  const rules = [
    [
      "25 days to make your own",
      "Every person gets 25 working days per calendar year. Your allowance resets on January 1; unused days do not carry over.",
    ],
    [
      "Weekends don’t count",
      "Only Monday through Friday count toward your allowance. No public-holiday calendar has been provided, so weekday holidays count as working days.",
    ],
    [
      "A little planning goes a long way",
      "Pending and approved requests reserve your allowance. Rejected requests do not. Dates cannot overlap a pending or approved request.",
    ],
    [
      "Your team, in balance",
      "Your team manager reviews requests. When more than 40% of the team is already approved away, we show a heads-up, not an automatic rejection. Pending leave is not included in this warning.",
    ],
    [
      "New year, fresh balance",
      "Requests that cross December 31 are split between each calendar year’s allowance. A single request can span no more than 366 days.",
    ],
  ];
  return (
    <Modal title="Nordia leave policy" onClose={onClose}>
      <div className="modal-header">
        <span className="modal-hero-icon">
          <BookOpen size={25} />
        </span>
        <span className="eyebrow">GOOD TO KNOW</span>
        <h2>Space to recharge.</h2>
        <p>A simple leave policy. Because time off should feel easy.</p>
      </div>
      <div className="policy-rules">
        {rules.map(([title, content], index) => (
          <section key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{title}</h3>
              <p>{content}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="modal-footer">
        <button className="primary-button" onClick={onClose}>
          Sounds good
          <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}
export function HelpDialog({ onClose, onPolicy }: { onClose: () => void; onPolicy: () => void }) {
  return (
    <Modal title="Help and support" onClose={onClose}>
      <div className="modal-header">
        <span className="modal-hero-icon">
          <CircleHelp size={25} />
        </span>
        <span className="eyebrow">WE’VE GOT YOU</span>
        <h2>A little help, right here.</h2>
        <p>Everything you need to find your balance.</p>
      </div>
      <div className="help-questions">
        <details open>
          <summary>How do I request time off?</summary>
          <p>
            Choose “Request leave”, enter your first and last day off, and send your request. You
            can add a reason, but you don’t have to. Your team manager will take it from there.
          </p>
        </details>
        <details>
          <summary>Why is my available balance lower?</summary>
          <p>
            Pending requests reserve days. Your remaining balance is 25 minus approved days; your
            available balance also subtracts pending days.
          </p>
        </details>
        <details>
          <summary>How do I try the manager view?</summary>
          <p>
            Choose “Switch user / Log out” to return to the welcome page. Open Manager Portal,
            search the actual directory by name or ID, select your profile, and click Continue. This
            is identification only, not real authentication.
          </p>
        </details>
        <details>
          <summary>Where can I find my manager’s comments?</summary>
          <p>
            Open any request in your history to see its full details and your manager’s note.
            Rejected requests always include a comment.
          </p>
        </details>
        <details>
          <summary>Who can see my reason for leave?</summary>
          <p>
            Only you and your team manager can access your request details. Your teammates can see
            approved dates on the team calendar, but never your reason or manager comments.
          </p>
        </details>
      </div>
      <div className="help-contact">
        <ShieldCheck size={18} />
        <p>Still have a question? Reach out to your team manager or your People & Culture team.</p>
      </div>
      <div className="modal-footer">
        <button className="secondary-button" onClick={onPolicy}>
          <BookOpen size={16} />
          Read the leave policy
        </button>
        <button className="primary-button" onClick={onClose}>
          All clear
          <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}
