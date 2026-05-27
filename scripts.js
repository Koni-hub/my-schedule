// ==================== GOOGLE CALENDAR RECURRING SYNC FIX ====================

const CLIENT_ID =
  "164186564132-176l4unvn16dtt4qc028t4rirv9nhd2n.apps.googleusercontent.com";
const API_KEY = "AIzaSyD__3OJHOVkVvvDGiUjqg__zqcCH9pYAU0";

const SCOPES = "https://www.googleapis.com/auth/calendar";
const TIME_ZONE = "Asia/Manila";
const CALENDAR_NAME = "Dev Schedule";

// Set true once if you want to reset/delete old wrong calendar.
const DELETE_DEV_SCHEDULE_CALENDAR_FIRST = false;

let tokenClient;
let devScheduleCalendarId = null;

const DAY_CODES = {
  Monday: "MO",
  Tuesday: "TU",
  Wednesday: "WE",
  Thursday: "TH",
  Friday: "FR",
  Saturday: "SA",
  Sunday: "SU",
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

window.onload = async () => {
  renderTimeline();
  renderWeekly();
  renderProjects();
  tick();

  setInterval(tick, 1000);
  setInterval(renderTimeline, 60000);

  await initGoogleCalendar();
  syncRecurringRoutineToGoogle();
};

function initGoogleCalendar() {
  return new Promise((resolve) => {
    gapi.load("client", async () => {
      await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [
          "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
        ],
      });

      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (response) => {
          if (response.error) {
            console.error(response);
            alert("Google login failed.");
            return;
          }

          try {
            if (DELETE_DEV_SCHEDULE_CALENDAR_FIRST) {
              await deleteDevScheduleCalendar();
              alert(
                "Dev Schedule calendar deleted. Set DELETE_DEV_SCHEDULE_CALENDAR_FIRST back to false.",
              );
              return;
            }

            devScheduleCalendarId = await getOrCreateDevScheduleCalendar();
            await deleteAllDevScheduleEvents();
            await createRecurringRoutineEvents();

            alert("Dev Schedule synced with correct Asia/Manila time.");
          } catch (err) {
            console.error("Sync error:", err);
            alert("Sync error. Check browser console.");
          }
        },
      });

      resolve();
    });
  });
}

function syncRecurringRoutineToGoogle() {
  if (!tokenClient) return;

  tokenClient.requestAccessToken({
    prompt: "consent",
  });
}

async function getOrCreateDevScheduleCalendar() {
  const calendars = await gapi.client.calendar.calendarList.list();

  const existing = calendars.result.items.find(
    (calendar) => calendar.summary === CALENDAR_NAME,
  );

  if (existing) return existing.id;

  const created = await gapi.client.calendar.calendars.insert({
    resource: {
      summary: CALENDAR_NAME,
      timeZone: TIME_ZONE,
    },
  });

  return created.result.id;
}

async function deleteDevScheduleCalendar() {
  const calendars = await gapi.client.calendar.calendarList.list();

  const existing = calendars.result.items.find(
    (calendar) => calendar.summary === CALENDAR_NAME,
  );

  if (!existing) {
    alert("No Dev Schedule calendar found.");
    return;
  }

  await gapi.client.calendar.calendars.delete({
    calendarId: existing.id,
  });
}

async function deleteAllDevScheduleEvents() {
  let pageToken = null;

  do {
    const result = await gapi.client.calendar.events.list({
      calendarId: devScheduleCalendarId,
      maxResults: 2500,
      singleEvents: false,
      pageToken,
    });

    const events = result.result.items || [];

    for (const event of events) {
      await gapi.client.calendar.events.delete({
        calendarId: devScheduleCalendarId,
        eventId: event.id,
      });
    }

    pageToken = result.result.nextPageToken;
  } while (pageToken);
}

function getNextDateForDay(dayName) {
  const today = new Date();
  const target = DAY_NAMES.indexOf(dayName);
  const diff = (target - today.getDay() + 7) % 7;

  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  d.setHours(0, 0, 0, 0);

  return d;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// IMPORTANT FIX:
// No .toISOString()
// No +08:00 suffix
// Google Calendar will use timeZone: "Asia/Manila"
function makeManilaDateTime(baseDate, hour, minute, addDays = 0) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + addDays);

  const date = formatDate(d);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");

  return `${date}T${hh}:${mm}:00`;
}

async function insertRecurringEvent(dayName, block) {
  const baseDate = getNextDateForDay(dayName);

  let endHour = block.eh;
  let endAddDays = 0;

  if (block.eh === 24) {
    endHour = 0;
    endAddDays = 1;
  }

  const event = {
    summary: block.label,
    description: block.sub || "From Dev Schedule",
    colorId: block.googleColorId || undefined,
    start: {
      dateTime: makeManilaDateTime(baseDate, block.sh, block.sm),
      timeZone: TIME_ZONE,
    },
    end: {
      dateTime: makeManilaDateTime(baseDate, endHour, block.em, endAddDays),
      timeZone: TIME_ZONE,
    },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${DAY_CODES[dayName]}`],
  };

  await gapi.client.calendar.events.insert({
    calendarId: devScheduleCalendarId,
    resource: event,
  });
}

async function createRecurringRoutineEvents() {
  for (const dayName of Object.keys(WEEKLY)) {
    const blocks = buildDailyBlocks(dayName);

    for (const block of blocks) {
      await insertRecurringEvent(dayName, block);
    }
  }
}

// ==================== DATA ====================

const GOOGLE_COLOR_IDS = {
  sleep: "8", // gray
  routine: "8", // gray
  health: "10", // green
  school: "9", // blue
  gap: "8", // gray
  learning: "3", // purple
  work: "2", // green
  university: "3", // purple
  ashes: "6", // orange
  kitchen: "9", // blue
  horror: "11", // red
  rest: "8", // gray
};

function buildDailyBlocks(dayName) {
  const f = WEEKLY[dayName];

  return [
    {
      sh: 0,
      sm: 0,
      eh: 5,
      em: 0,
      label: "Sleep",
      sub: "12:00 AM – 5:00 AM",
      type: "sleep",
      color: "#5e5d5a",
      googleColorId: GOOGLE_COLOR_IDS.sleep,
    },
    {
      sh: 5,
      sm: 0,
      eh: 5,
      em: 30,
      label: "Wake Up",
      sub: "Start of day",
      type: "routine",
      color: "#888780",
      googleColorId: GOOGLE_COLOR_IDS.routine,
    },
    {
      sh: 5,
      sm: 30,
      eh: 6,
      em: 15,
      label: "Workout / Exercise",
      sub: "Strength training, cardio & stretching",
      type: "health",
      color: "#639922",
      googleColorId: GOOGLE_COLOR_IDS.health,
    },
    {
      sh: 6,
      sm: 15,
      eh: 7,
      em: 0,
      label: "Breakfast + Prepare",
      sub: "Eat and get ready for the day",
      type: "routine",
      color: "#888780",
      googleColorId: GOOGLE_COLOR_IDS.routine,
    },
    {
      sh: 7,
      sm: 0,
      eh: 16,
      em: 0,
      label: "Class / School",
      sub: "No class? → rest, study, or freelance tasks",
      type: "school",
      color: "#378ADD",
      googleColorId: GOOGLE_COLOR_IDS.school,
    },
    {
      sh: 16,
      sm: 0,
      eh: 17,
      em: 0,
      label: "Free Time / Gap",
      sub: "Wind down between school and evening",
      type: "gap",
      color: "#5e5d5a",
      googleColorId: GOOGLE_COLOR_IDS.gap,
    },
    {
      sh: 17,
      sm: 0,
      eh: 19,
      em: 0,
      label: "Dinner + Rest",
      sub: "Recharge before evening work",
      type: "routine",
      color: "#888780",
      googleColorId: GOOGLE_COLOR_IDS.routine,
    },
    {
      sh: 20,
      sm: 0,
      eh: 20,
      em: 30,
      label: "Learn Chinese",
      sub: "Study vocabulary, listening, and speaking practice",
      type: "learning",
      color: "#6C63FF",
      googleColorId: GOOGLE_COLOR_IDS.learning,
    },
    {
      sh: 21,
      sm: 0,
      eh: 23,
      em: 30,
      label: f.main,
      sub: "Highest-priority project — full focus block",
      type: f.mainType,
      color: PROJ_COLORS[f.mainType] || "#1D9E75",
      googleColorId: GOOGLE_COLOR_IDS[f.mainType] || GOOGLE_COLOR_IDS.work,
    },
    {
      sh: 23,
      sm: 30,
      eh: 24,
      em: 0,
      label: f.sec,
      sub: "Secondary project / planning",
      type: f.secType,
      color: PROJ_COLORS[f.secType] || "#EF9F27",
      googleColorId: GOOGLE_COLOR_IDS[f.secType] || GOOGLE_COLOR_IDS.rest,
    },
  ];
}

const WEEKLY = {
  Monday: {
    main: "Second Chance",
    mainType: "work",
    sec: "Paragon University",
    secType: "university",
  },
  Tuesday: {
    main: "Second Chance",
    mainType: "work",
    sec: "Ashes",
    secType: "ashes",
  },
  Wednesday: {
    main: "Second Chance",
    mainType: "work",
    sec: "Paragon University",
    secType: "university",
  },
  Thursday: {
    main: "Ashes",
    mainType: "ashes",
    sec: "PHKitchenDuo",
    secType: "kitchen",
  },
  Friday: {
    main: "Second Chance",
    mainType: "work",
    sec: "Personal Horror Game",
    secType: "horror",
  },
  Saturday: {
    main: "Personal Horror Game",
    mainType: "horror",
    sec: "Ashes",
    secType: "ashes",
  },
  Sunday: {
    main: "Rest / Planning",
    mainType: "rest",
    sec: "Small Tasks",
    secType: "rest",
  },
};

const PROJ_COLORS = {
  work: "#1D9E75",
  university: "#7F77DD",
  ashes: "#EF9F27",
  kitchen: "#378ADD",
  horror: "#D85A30",
  rest: "#888780",
};

const PROJECTS = [
  {
    num: 1,
    name: "Second Chance",
    priority: "Highest Priority",
    type: "work",
    color: "#1D9E75",
    engine: "Unreal Engine 5.7",
    team: "Solo developer",
    client: "Self-funded",
    sched: "4–5 days/week",
    focus:
      "You are handling everything alone — coding, assets, design. This deserves the most focused time and energy in your schedule.",
    tags: ["Coding-heavy", "Resources available", "Solo dev"],
  },
  {
    num: 2,
    name: "Paragon University Project",
    priority: "High Priority",
    type: "university",
    color: "#7F77DD",
    engine: "School / University",
    team: "Academic project",
    client: "University deadline",
    sched: "2–3 days/week",
    focus:
      "Treat this as a required daily responsibility, not a side task. Scale up time significantly during deadline weeks.",
    tags: ["Academic", "Deadlines", "Required"],
  },
  {
    num: 3,
    name: "Ashes",
    priority: "Medium Priority",
    type: "ashes",
    color: "#EF9F27",
    engine: "Unreal Engine 5.3",
    team: "2 developers",
    client: "Client-provided resources",
    sched: "2–3 days/week · Secondary work block when needed",
    focus:
      "Medium priority because the workload is shared. Coordinate with your co-dev to avoid bottlenecks.",
    tags: ["Shared workload", "Client resources", "2 devs"],
  },
  {
    num: 4,
    name: "PHKitchenDuo",
    priority: "Low Priority",
    type: "kitchen",
    color: "#378ADD",
    engine: "Unity 2022.3",
    team: "Team project",
    client: "Team-owned",
    sched: "1–2 sessions per week only",
    focus:
      "Your responsibility is scoped to a single feature or task. Don't over-invest — stay focused on your one deliverable.",
    tags: ["One feature", "Team project", "Limited scope"],
  },
  {
    num: 5,
    name: "Personal Horror Game",
    priority: "Long-Term",
    type: "horror",
    color: "#D85A30",
    engine: "Unreal Engine 5",
    team: "Solo developer",
    client: "Self-funded",
    sched: "Fri night + Sat + Sun · Max 6–8 hours/week",
    focus:
      "This is your passion project and portfolio piece. Work on it when inspired — don't force daily sessions. Quality over grind.",
    tags: ["Passion project", "Portfolio", "Solo dev"],
  },
];

// ==================== HELPERS ====================

function toMins(h, m) {
  return h * 60 + m;
}

function fmtH(h, m) {
  const ap = h >= 12 ? "PM" : "AM";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

function nowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function getTodayName() {
  return DAY_NAMES[new Date().getDay()];
}

function getActiveBlock(blocks) {
  const m = nowMins();

  for (const b of blocks) {
    const s = toMins(b.sh, b.sm);
    const e = toMins(b.eh, b.em);

    if (b.label === "Sleep") {
      if (m >= 0 && m < 300) return b;
    } else if (m >= s && m < e) {
      return b;
    }
  }

  return null;
}

function normalizeHour(h) {
  return h === 24 ? 0 : h;
}

// ==================== RENDER FUNCTIONS ====================

function renderTimeline() {
  const dayName = getTodayName();
  const blocks = buildDailyBlocks(dayName);
  const tl = document.getElementById("timeline");

  if (!tl) return;

  const active = getActiveBlock(blocks);

  // Show 5:00 AM first, then Sleep at the bottom like your mockup.
  const display = blocks.slice(1);
  display.push(blocks[0]);

  tl.innerHTML = display
    .map((b, i) => {
      const isLast = i === display.length - 1;
      const isActive = active && active.label === b.label;

      const startLabel = b.label === "Sleep" ? "12:00 AM" : fmtH(b.sh, b.sm);
      const endLabel =
        b.label === "Sleep" ? "5:00 AM" : fmtH(normalizeHour(b.eh), b.em);

      return `
      <div class="tl-item${isActive ? " active-block" : ""}">
        <div class="tl-time">
          ${startLabel}<br>
          <span style="color:var(--bg4)">─</span><br>
          ${endLabel}
        </div>

        <div class="tl-track">
          <div class="tl-dot" style="background:${b.color}"></div>
          ${!isLast ? '<div class="tl-line"></div>' : ""}
        </div>

        <div class="tl-body">
          <div class="tl-name" style="color:${isActive ? b.color : "var(--text)"}">
            ${b.label}
          </div>
          <div class="tl-sub">${b.sub}</div>
        </div>
      </div>
    `;
    })
    .join("");
}

function updateNowBanner() {
  const dayName = getTodayName();
  const blocks = buildDailyBlocks(dayName);
  const b = getActiveBlock(blocks);

  const nameEl = document.getElementById("nowName");
  const timeEl = document.getElementById("nowTime");

  if (!nameEl || !timeEl) return;

  if (b) {
    nameEl.style.color = b.color;
    nameEl.textContent = b.label;

    const end =
      b.label === "Sleep"
        ? "5:00 AM"
        : b.eh === 24
          ? "12:00 AM"
          : fmtH(b.eh, b.em);

    timeEl.textContent = `Until ${end}`;
  } else {
    nameEl.style.color = "var(--text2)";
    nameEl.textContent = "Free Time";
    timeEl.textContent = "—";
  }
}

function renderWeekly() {
  const todayName = getTodayName();
  const grid = document.getElementById("weekGrid");

  if (!grid) return;

  grid.innerHTML = Object.keys(WEEKLY)
    .map((day) => {
      const f = WEEKLY[day];
      const isToday = day === todayName;
      const mc = PROJ_COLORS[f.mainType] || "#888";
      const sc = PROJ_COLORS[f.secType] || "#888";

      return `<div class="day-card${isToday ? " today" : ""}" onclick="selectDay('${day}',this)">
      <div class="day-head">
        <span class="day-name-label">${day.substring(0, 3)}</span>
        ${isToday ? '<span class="today-tag">Today</span>' : ""}
      </div>
      <div class="focus-label">Main Focus</div>
      <div class="focus-badge" style="background:${mc}22;color:${mc};border-color:${mc}44">${f.main}</div>
      <div class="focus-label">Secondary</div>
      <div class="focus-badge" style="background:${sc}22;color:${sc};border-color:${sc}44">${f.sec}</div>
    </div>`;
    })
    .join("");
}

function selectDay(day, el) {
  document
    .querySelectorAll(".day-card")
    .forEach((c) => c.classList.remove("selected"));

  if (el) el.classList.add("selected");

  renderDayDetail(day);
}

function renderDayDetail(day) {
  const detail = document.getElementById("dayDetail");
  const f = WEEKLY[day];

  if (!detail || !f) return;

  const todayName = getTodayName();
  const isToday = day === todayName;
  const mc = PROJ_COLORS[f.mainType] || "#888";
  const sc = PROJ_COLORS[f.secType] || "#888";

  detail.style.display = "block";
  detail.innerHTML = `
    <div class="detail-day-header">
      <div class="detail-day-name">${day}${isToday ? ' <span style="font-size:11px;color:var(--teal);font-family:var(--mono)">[today]</span>' : ""}</div>
      <div class="detail-day-sub">Evening work session breakdown</div>
    </div>
    <div class="detail-rows">
      <div class="detail-row">
        <div class="detail-row-time">9:00 PM – 11:30 PM</div>
        <div class="detail-row-name" style="color:${mc}">${f.main}</div>
        <div class="detail-row-badge" style="color:${mc};background:${mc}22;border-color:${mc}44">Main Focus</div>
      </div>
      <div class="detail-row">
        <div class="detail-row-time">11:30 PM – 12:00 AM</div>
        <div class="detail-row-name" style="color:${sc}">${f.sec}</div>
        <div class="detail-row-badge" style="color:${sc};background:${sc}22;border-color:${sc}44">Secondary</div>
      </div>
    </div>`;
}

function renderProjects() {
  const container = document.getElementById("projectsList");

  if (!container) return;

  container.innerHTML = PROJECTS.map((p) => {
    const c = p.color;

    return `<div class="proj-card" id="proj-${p.num}">
      <div class="proj-header" onclick="toggleProject(${p.num})">
        <div class="proj-num">#${p.num}</div>
        <div class="proj-dot" style="background:${c}"></div>
        <div class="proj-name" style="color:${c}">${p.name}</div>
        <div class="proj-badge" style="color:${c};background:${c}22;border-color:${c}44">${p.priority}</div>
        <div class="proj-chevron">▾</div>
      </div>
      <div class="proj-details">
        <div class="proj-details-grid">
          <div class="proj-detail-block">
            <div class="proj-detail-title">Engine / Platform</div>
            <div class="proj-detail-val"><code style="color:${c}">${p.engine}</code></div>
          </div>
          <div class="proj-detail-block">
            <div class="proj-detail-title">Team</div>
            <div class="proj-detail-val">${p.team}</div>
          </div>
          <div class="proj-detail-block">
            <div class="proj-detail-title">Recommended Schedule</div>
            <div class="proj-detail-val">${p.sched}</div>
          </div>
          <div class="proj-detail-block">
            <div class="proj-detail-title">Tags</div>
            <div class="proj-tags">
              ${p.tags
                .map(
                  (t) =>
                    `<span class="proj-tag" style="background:${c}22;color:${c}">${t}</span>`,
                )
                .join("")}
            </div>
          </div>
          <div class="proj-detail-block full">
            <div class="proj-detail-title">Focus Note</div>
            <div class="proj-detail-val">${p.focus}</div>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

function toggleProject(num) {
  const el = document.getElementById(`proj-${num}`);
  if (!el) return;
  el.classList.toggle("open");
}

function switchTab(name, btn) {
  document
    .querySelectorAll(".tab-panel")
    .forEach((p) => p.classList.remove("active"));

  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));

  const panel = document.getElementById(`tab-${name}`);
  if (panel) panel.classList.add("active");

  if (btn) btn.classList.add("active");
}

// ==================== CLOCK ====================

function tick() {
  const now = new Date();
  let h = now.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;

  const hh = String(h).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");

  const clock = document.getElementById("liveClock");
  const date = document.getElementById("liveDate");

  if (clock) clock.textContent = `${hh}:${m}:${s} ${ap}`;
  if (date) {
    date.textContent = `${DAY_NAMES[now.getDay()]}, ${MONTH_NAMES[now.getMonth()]} ${now.getDate()}`;
  }

  updateNowBanner();
}
