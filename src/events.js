import { t, locale, nameOf, number } from "./i18n.js";
import { esc, icon, notify, ask, s } from "./ui.js";
import { submitEventRequest, saveEventSurvey } from "./store.js";
import { normalizeContactPhone } from "./consultation.js";
import e from "./styles/events.module.css";

const activityKeys = [
  "eventActivityWheel",
  "eventActivityScratch",
  "eventActivityAnalysis",
  "eventActivityTraining",
];
const activityValues = [
  "wheel",
  "scratch_cards",
  "analysis_discount",
  "pharmacist_training",
];
const activityLabels = Object.fromEntries(
  activityValues.map((value, index) => [value, activityKeys[index]]),
);

const displayDate = (date) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

const field = (key, type = "text", options = {}) =>
  `<label for="event-${key}">${t(options.label)}<input id="event-${key}" name="${key}" type="${type}" ${options.required ? "required" : ""} maxlength="${options.maxLength || 200}" ${options.direction ? `dir="${options.direction}"` : ""} ${options.autocomplete ? `autocomplete="${options.autocomplete}"` : ""} /></label>`;

function clientForm(data, survey) {
  const companies = data.companies
    .map(
      (company) =>
        `<label class="${e.choice}"><input type="checkbox" name="company_ids" value="${esc(company.id)}" /><span>${esc(nameOf(company))}</span></label>`,
    )
    .join("");
  const activities = activityValues
    .map(
      (value, index) =>
        `<label class="${e.choice}"><input type="checkbox" name="activities" value="${value}" /><span>${t(activityKeys[index])}</span></label>`,
    )
    .join("");

  return `<form id="event-request-form" class="${e.requestForm}" data-survey-id="${esc(survey.id)}" novalidate><div class="${e.fields}">${field("pharmacy_name", "text", { label: "eventPharmacyName", required: true, maxLength: 200 })}${field("pharmacy_code", "text", { label: "eventPharmacyCode", required: true, maxLength: 80 })}${field("pharmacy_address", "text", { label: "eventPharmacyAddress", required: true, maxLength: 500 })}${field("doctor_name", "text", { label: "eventDoctorName", required: true, maxLength: 160 })}${field("phone", "tel", { label: "eventPhone", required: true, maxLength: 30, direction: "ltr", autocomplete: "tel" })}${field("preferred_date", "date", { label: "eventPreferredDate", required: true })}${field("starts_at", "time", { label: "eventStartsAt", required: true })}${field("ends_at", "time", { label: "eventEndsAt", required: true })}</div><fieldset class="${e.choiceGroup}"><legend>${t("eventCompanies")}</legend><p>${t("eventCompaniesHelp")}</p><div class="${e.choiceGrid}">${companies || `<span>${t("exclusiveEmpty")}</span>`}</div></fieldset><fieldset class="${e.choiceGroup}"><legend>${t("eventActivities")}</legend><label class="${e.selectAll}"><input id="event-select-all-activities" type="checkbox" /><span>${t("eventSelectAll")}</span></label><div class="${e.choiceGrid}">${activities}</div></fieldset><p class="${e.formError}" role="alert"></p><p id="event-request-status" class="${e.formStatus}" role="status"></p><button class="${s.button} ${s.primary}" type="submit">${t("eventSubmit")}</button></form>`;
}

export function eventsPage(data) {
  const survey = data.event_surveys.find((item) => item.is_open);
  return `<section class="${e.page}"><div class="${e.heading}"><h1 tabindex="-1">${t("events")}</h1><p>${t("eventsIntro")}</p></div>${survey ? `<article class="${e.clientSurvey}"><div class="${e.surveyStatus}" data-open="true"><span aria-hidden="true"></span>${t("eventSurveyOpen")}</div><p class="${e.description}">${t("eventSurveyOpenHelp")}</p>${clientForm(data, survey)}</article>` : `<div class="${e.empty}"><div class="${e.surveyStatus}" data-open="false"><span aria-hidden="true"></span>${t("eventSurveyClosed")}</div><p>${t("eventSurveyUnavailable")}</p></div>`}</section>`;
}

export function bindEvents(root, signal, render) {
  const form = root.querySelector("#event-request-form");
  if (!form) return;

  const selectAll = form.querySelector("#event-select-all-activities");
  const activityInputs = [...form.querySelectorAll('[name="activities"]')];
  selectAll.addEventListener(
    "change",
    () => {
      activityInputs.forEach((input) => (input.checked = selectAll.checked));
    },
    { signal },
  );
  activityInputs.forEach((input) =>
    input.addEventListener(
      "change",
      () => {
        selectAll.checked = activityInputs.every((item) => item.checked);
        selectAll.indeterminate =
          !selectAll.checked && activityInputs.some((item) => item.checked);
      },
      { signal },
    ),
  );

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      if (form.dataset.busy === "true") return;
      const values = Object.fromEntries(new FormData(form));
      const error = form.querySelector('[role="alert"]');
      const status = form.querySelector('[role="status"]');
      const phoneInput = form.elements.phone;
      error.textContent = "";
      status.textContent = "";
      phoneInput.removeAttribute("aria-invalid");

      if (
        !values.pharmacy_name?.trim() ||
        !values.pharmacy_code?.trim() ||
        !values.pharmacy_address?.trim() ||
        !values.doctor_name?.trim() ||
        !values.phone?.trim() ||
        !values.preferred_date ||
        !values.starts_at ||
        !values.ends_at
      ) {
        error.textContent = t("eventRequired");
        form.querySelector(":invalid")?.focus();
        return;
      }
      const phone = normalizeContactPhone(values.phone);
      if (!phone) {
        error.textContent = t("invalidPhone");
        phoneInput.setAttribute("aria-invalid", "true");
        phoneInput.focus();
        return;
      }
      if (values.ends_at <= values.starts_at) {
        error.textContent = t("eventTimeError");
        form.elements.ends_at.focus();
        return;
      }

      const button = form.querySelector('[type="submit"]');
      form.dataset.busy = "true";
      button.disabled = true;
      const request = {
        survey_id: form.dataset.surveyId,
        pharmacy_name: values.pharmacy_name.trim(),
        pharmacy_code: values.pharmacy_code.trim(),
        pharmacy_address: values.pharmacy_address.trim(),
        doctor_name: values.doctor_name.trim(),
        phone,
        preferred_date: values.preferred_date,
        starts_at: values.starts_at,
        ends_at: values.ends_at,
        company_ids: [...new Set(new FormData(form).getAll("company_ids"))],
        activities: [...new Set(new FormData(form).getAll("activities"))],
      };
      try {
        await submitEventRequest(request);
        notify(t("eventSubmitSuccess"));
        await render();
      } catch (issue) {
        error.textContent =
          issue?.message === "event_closed" || issue?.code === "42501"
            ? t("eventSurveyUnavailable")
            : issue?.code === "23503" || issue?.message === "invalid_company"
              ? t("eventCompanyInvalid")
              : t("eventSubmitError");
        form.dataset.busy = "false";
        button.disabled = false;
      }
    },
    { signal },
  );
}

function choicesText(row) {
  const companies = Array.isArray(row.company_names) ? row.company_names : [];
  const companyNames = companies
    .map((company) =>
      typeof company === "string"
        ? company
        : locale === "ar"
          ? company.name_ar || company.name_en
          : company.name_en || company.name_ar,
    )
    .filter(Boolean);
  const activities = (row.activities || []).map((activity) =>
    t(activityLabels[activity] || activity),
  );
  return {
    companies: companyNames.length ? companyNames.join("، ") : "—",
    activities: activities.length ? activities.join("، ") : "—",
  };
}

function submittedAt(value) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function requestTable(rows) {
  if (!rows.length)
    return `<div class="${e.empty}"><h2>${t("eventNoRequests")}</h2><p>${t("eventNoRequestsText")}</p></div>`;
  const body = rows
    .map((row) => {
      const choices = choicesText(row);
      return `<tr><td>${esc(row.pharmacy_name)}</td><td dir="ltr">${esc(row.pharmacy_code)}</td><td>${esc(row.pharmacy_address)}</td><td>${esc(row.doctor_name)}</td><td dir="ltr"><a href="tel:${esc(row.phone)}">${esc(row.phone)}</a></td><td>${displayDate(row.preferred_date)}</td><td dir="ltr"><bdi>${esc(row.starts_at.slice(0, 5))}–${esc(row.ends_at.slice(0, 5))}</bdi></td><td>${esc(choices.companies)}</td><td>${esc(choices.activities)}</td><td>${esc(submittedAt(row.submitted_at))}</td></tr>`;
    })
    .join("");
  return `<p class="${e.tableScrollHint}">${t("tableScrollHint")}</p><div class="${e.requestTableWrap}" role="region" tabindex="0" aria-label="${t("eventRequests")}"><table class="${e.requestTable}"><thead><tr><th scope="col">${t("eventPharmacyName")}</th><th scope="col">${t("eventPharmacyCode")}</th><th scope="col">${t("eventPharmacyAddress")}</th><th scope="col">${t("eventDoctorName")}</th><th scope="col">${t("eventPhone")}</th><th scope="col">${t("eventPreferredDate")}</th><th scope="col">${t("eventStartsAt")} – ${t("eventEndsAt")}</th><th scope="col">${t("eventCompanies")}</th><th scope="col">${t("eventActivities")}</th><th scope="col">${t("eventSubmittedAt")}</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

export function adminEventsPage(data) {
  const activeSurvey = data.event_surveys.find((item) => item.is_open);
  const requests = data.event_requests;
  const status = activeSurvey ? "eventSurveyOpen" : "eventSurveyClosed";
  const statusHelp = activeSurvey
    ? "eventSurveyOpenHelp"
    : "eventSurveyClosedHelp";
  const action = activeSurvey ? "eventEndSurvey" : "eventStartSurvey";
  return `<section class="${e.adminPage}"><div class="${e.heading}"><h1 tabindex="-1">${t("events")}</h1><p>${t("eventAdminIntro")}</p></div><section class="${e.surveyPanel}" aria-labelledby="event-survey-title"><div><h2 id="event-survey-title">${t("eventSurveyStatus")}</h2><p>${t(statusHelp)}</p></div><span class="${e.surveyStatus}" data-open="${Boolean(activeSurvey)}"><span aria-hidden="true"></span>${t(status)}</span><button id="event-survey-toggle" type="button" class="${s.button} ${s.primary}" data-survey-id="${esc(activeSurvey?.id || "")}" data-revision="${activeSurvey?.revision || 0}">${t(action)}</button><p id="event-survey-error" class="${e.formError}" role="alert"></p></section><div class="${e.requestsHeading}"><h2>${t("eventRequests")}</h2><span>${number(requests.length)} ${t("eventRequestCount")}</span></div>${requestTable(requests)}</section>`;
}

export function bindAdminEvents(root, signal, render, setDirty) {
  const button = root.querySelector("#event-survey-toggle");
  if (!button) return;
  button.addEventListener(
    "click",
    async () => {
      const isOpen = Boolean(button.dataset.surveyId);
      const confirmed = await ask(
        t(isOpen ? "eventCloseSurveyConfirm" : "eventOpenSurveyConfirm"),
        t(isOpen ? "eventSurveyOpenHelp" : "eventSurveyClosedHelp"),
        t(isOpen ? "eventEndSurvey" : "eventStartSurvey"),
      );
      if (!confirmed) return;
      const error = root.querySelector("#event-survey-error");
      error.textContent = "";
      button.disabled = true;
      try {
        await saveEventSurvey(
          isOpen
            ? { id: button.dataset.surveyId, is_open: false }
            : { is_open: true },
          Number(button.dataset.revision),
        );
        setDirty(false);
        notify(t(isOpen ? "eventSurveyEnded" : "eventSurveyStarted"));
        await render();
      } catch {
        error.textContent = t("eventSurveySaveError");
        button.disabled = false;
      }
    },
    { signal },
  );
}
