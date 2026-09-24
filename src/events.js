import { t, locale } from "./i18n.js";
import { esc, icon, notify, s } from "./ui.js";
import { registerForEvent, saveEvent } from "./store.js";
import e from "./styles/events.module.css";

const cairoToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const eventStatus = (event) => {
  const today = cairoToday();
  return today < event.start_date
    ? "eventUpcoming"
    : today > event.end_date
      ? "eventClosed"
      : "eventOpen";
};

const displayDate = (date) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

export function eventsPage(data, authState) {
  const userId = authState.user?.id;
  const profile = authState.profile || {};
  const cards = data.events
    .map((event) => {
      const status = eventStatus(event);
      const registered = data.event_participants.some(
        (item) => item.event_id === event.id && item.user_id === userId,
      );
      return `<article class="${e.card}"><div class="${e.cardHead}"><h2>${esc(event.name)}</h2><span class="${e.status}" data-state="${status}">${t(status)}</span></div><p class="${e.description}">${esc(event.description)}</p><p class="${e.dates}">${icon("calendar")}<time datetime="${event.start_date}">${displayDate(event.start_date)}</time><span aria-hidden="true">—</span><time datetime="${event.end_date}">${displayDate(event.end_date)}</time></p>${registered ? `<p class="${e.registered}">${icon("check")}${t("eventRegistered")}</p>` : status === "eventOpen" ? `<form class="${e.registerForm}" data-event-id="${event.id}" novalidate><p>${t("eventFormHelp")}</p><div class="${e.fields}"><label>${t("eventYourName")}<input name="name" maxlength="160" required autocomplete="name" value="${esc(profile.name || "")}" /></label><label>${t("eventYourPhone")}<input name="phone" type="tel" dir="ltr" maxlength="30" required autocomplete="tel" value="${esc(profile.phone || "")}" /></label></div><p class="${e.formError}" role="alert"></p><button class="${s.button} ${s.primary}" type="submit">${t("eventRegister")}</button></form>` : ""}</article>`;
    })
    .join("");
  return `<section class="${e.page}"><div class="${e.heading}"><h1 tabindex="-1">${t("events")}</h1><p>${t("eventsIntro")}</p></div>${cards ? `<div class="${e.list}">${cards}</div>` : `<div class="${e.empty}"><h2>${t("eventNoEvents")}</h2><p>${t("eventNoEventsText")}</p></div>`}</section>`;
}

export function bindEvents(root, signal, render) {
  root.querySelectorAll("[data-event-id]").forEach((form) =>
    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const name = form.elements.name.value.trim();
        const phone = form.elements.phone.value.trim();
        const error = form.querySelector('[role="alert"]');
        error.textContent = "";
        if (!name || phone.length < 7) {
          error.textContent = t("eventRequired");
          (!name ? form.elements.name : form.elements.phone).focus();
          return;
        }
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
          await registerForEvent(form.dataset.eventId, name, phone);
          notify(t("eventSaved"));
          await render();
        } catch (issue) {
          error.textContent =
            issue?.code === "23505"
              ? t("eventRegistered")
              : issue?.code === "42501" || issue?.message === "event_closed"
                ? t("eventClosedError")
                : t("eventRegisterError");
          submit.disabled = false;
        }
      },
      { signal },
    ),
  );
}

export function adminEventsPage(data, route) {
  const selected =
    route.parts[2] === "edit"
      ? data.events.find((item) => item.id === route.parts[3])
      : null;
  const editing = route.parts[2] === "edit";
  if (editing && !selected) return `<p>${t("notFound")}</p>`;
  const form = `<form id="event-editor" class="${e.adminForm}" data-id="${selected?.id || ""}" data-revision="${selected?.revision || 0}" novalidate><h2>${t(editing ? "eventEdit" : "eventCreate")}</h2><label>${t("eventName")}<input name="name" maxlength="200" required value="${esc(selected?.name || "")}" /></label><label>${t("eventDescription")}<textarea name="description" maxlength="3000" required rows="4">${esc(selected?.description || "")}</textarea></label><div class="${e.fields}"><label>${t("eventStart")}<input name="start_date" type="date" required value="${selected?.start_date || ""}" /></label><label>${t("eventEnd")}<input name="end_date" type="date" required value="${selected?.end_date || ""}" /></label></div><p class="${e.formError}" role="alert"></p><div class="${e.actions}"><button class="${s.button} ${s.primary}" type="submit">${t("save")}</button>${editing ? `<a class="${s.button} ${s.secondary}" href="#/admin/events">${t("cancel")}</a>` : ""}</div></form>`;
  const list = data.events
    .map((event) => {
      const people = data.event_participants.filter(
        (item) => item.event_id === event.id,
      );
      return `<article class="${e.adminEvent}"><div class="${e.cardHead}"><div><h3>${esc(event.name)}</h3><p>${displayDate(event.start_date)} — ${displayDate(event.end_date)}</p></div><a class="${s.button} ${s.secondary}" href="#/admin/events/edit/${event.id}">${t("edit")}</a></div><details><summary>${t("eventParticipants")} (${people.length})</summary>${people.length ? `<div class="${e.participantScroll}"><table><thead><tr><th>${t("eventYourName")}</th><th>${t("username")}</th><th>${t("eventYourPhone")}</th></tr></thead><tbody>${people.map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.username)}</td><td dir="ltr">${esc(item.phone)}</td></tr>`).join("")}</tbody></table></div>` : `<p>${t("empty")}</p>`}</details></article>`;
    })
    .join("");
  return `<div class="${e.adminPage}"><div class="${e.heading}"><h1 tabindex="-1">${t("events")}</h1><p>${t("eventsIntro")}</p></div>${form}<div class="${e.adminList}">${list}</div></div>`;
}

export function bindAdminEvents(root, signal, render, navigate, setDirty) {
  const form = root.querySelector("#event-editor");
  if (!form) return;
  form.addEventListener("input", () => setDirty(true), { signal });
  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const error = form.querySelector('[role="alert"]');
      error.textContent = "";
      if (
        !values.name.trim() ||
        !values.description.trim() ||
        !values.start_date ||
        !values.end_date
      ) {
        error.textContent = t("required");
        return;
      }
      if (values.end_date < values.start_date) {
        error.textContent = t("eventDatesError");
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await saveEvent(
          {
            ...values,
            id: form.dataset.id || undefined,
            name: values.name.trim(),
            description: values.description.trim(),
          },
          Number(form.dataset.revision),
        );
        setDirty(false);
        notify(t("saved"));
        navigate("#/admin/events");
      } catch (issue) {
        error.textContent =
          issue?.code === "conflict" ? t("conflict") : t("saveError");
        submit.disabled = false;
      }
    },
    { signal },
  );
}
