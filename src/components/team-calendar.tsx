"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Info, Leaf } from "lucide-react";
import type { TeamAvailability } from "@/lib/types";
import { formatDate, todayISO } from "@/lib/format";
import { Avatar } from "./ui";

export function TeamCalendar({ team }: { team: TeamAvailability }) {
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(index - offset + 1);
    return date.toISOString().slice(0, 10);
  });
  const weekday = (date: string) => {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return day !== 0 && day !== 6;
  };
  const eventsOn = (date: string) =>
    weekday(date)
      ? team.events.filter((event) => event.startDate <= date && event.endDate >= date)
      : [];
  function moveMonth(offset: number) {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + offset);
    setMonth(next.toISOString().slice(0, 7));
  }
  return (
    <section className="panel calendar-panel">
      <div className="panel-heading">
        <div>
          <h2>{formatDate(`${month}-01`, { month: "long", year: "numeric" })}</h2>
          <p>{team.name} · A shared view, a little more harmony.</p>
        </div>
        <div className="calendar-controls">
          <button
            className="secondary-button small"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelected(today);
            }}
          >
            Today
          </button>
          <button className="icon-button" onClick={() => moveMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={19} />
          </button>
          <button className="icon-button" onClick={() => moveMonth(1)} aria-label="Next month">
            <ChevronRight size={19} />
          </button>
        </div>
      </div>
      <div className="calendar-weekdays">
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((date) => (
          <button
            key={date}
            className={`calendar-day ${date.slice(0, 7) !== month ? "outside" : ""} ${!weekday(date) ? "weekend" : ""} ${date === selected ? "selected" : ""}`}
            onClick={() => setSelected(date)}
            aria-label={`${formatDate(date, { month: "long", day: "numeric" })}, ${eventsOn(date).length} people away`}
          >
            <span className={date === today ? "day-number today" : "day-number"}>
              {Number(date.slice(8, 10))}
            </span>
            <span className="calendar-events">
              {eventsOn(date)
                .slice(0, 2)
                .map((event) => (
                  <span className="calendar-event" key={event.id}>
                    <span className="tiny-dot green" />
                    {event.firstName}
                  </span>
                ))}
              {eventsOn(date).length > 2 && (
                <span className="calendar-more">+{eventsOn(date).length - 2} more</span>
              )}
            </span>
          </button>
        ))}
      </div>
      <div className="calendar-availability">
        <div className="calendar-day-heading">
          <CalendarDays size={18} />
          <h3>{formatDate(selected, { weekday: "long", month: "long", day: "numeric" })}</h3>
          <span>
            {weekday(selected) ? `${eventsOn(selected).length} away` : "A little weekend rest"}
          </span>
        </div>
        <div className="calendar-people">
          {team.members.map((person) => {
            const away = eventsOn(selected).some((event) => event.employeeId === person.id);
            return (
              <div key={person.id}>
                <Avatar person={person} size="sm" />
                <span>
                  <strong>
                    {person.firstName} {person.lastName}
                  </strong>
                  <small>{person.role === "MANAGER" ? "Team manager" : team.name}</small>
                </span>
                <span className={`availability-tag ${away ? "away" : ""}`}>
                  {away && <Leaf size={11} />}
                  {!weekday(selected) ? "Weekend" : away ? "On leave" : "Available"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="table-footer">
        <span>
          <Info size={13} />
          Only approved leave is shown. Reasons and comments stay private.
        </span>
      </div>
    </section>
  );
}
