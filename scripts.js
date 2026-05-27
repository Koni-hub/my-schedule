// ==================== GOOGLE CALENDAR RECURRING SYNC ====================

const CLIENT_ID =
  "164186564132-176l4unvn16dtt4qc028t4rirv9nhd2n.apps.googleusercontent.com";

const API_KEY = "AIzaSyD__3OJHOVkVvvDGiUjqg__zqcCH9pYAU0";

const SCOPES = "https://www.googleapis.com/auth/calendar";
const TIME_ZONE = "Asia/Manila";
const CALENDAR_NAME = "Dev Schedule";

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
            console.error("Google login failed:", response);
            alert("Google login failed.");
            return;
          }

          try {
            devScheduleCalendarId = await getOrCreateDevScheduleCalendar();

            await deleteAllEventsFromDevScheduleCalendar();

            await createRecurringRoutineEvents();

            alert("Dev Schedule calendar synced successfully.");
          } catch (err) {
            console.error("Sync error:", err);
            alert("Sync error. Check console.");
          }
        },
      });

      resolve();
    });
  });
}

function syncRecurringRoutineToGoogle() {
  if (!tokenClient) {
    console.error("Google token client not ready.");
    return;
  }

  tokenClient.requestAccessToken({ prompt: "" });
}

async function getOrCreateDevScheduleCalendar() {
  const calendars = await gapi.client.calendar.calendarList.list({
    maxResults: 250,
  });

  const existing = (calendars.result.items || []).find(
    (calendar) => calendar.summary === CALENDAR_NAME,
  );

  if (existing) {
    console.log("Existing Dev Schedule calendar found:", existing.id);
    return existing.id;
  }

  const created = await gapi.client.calendar.calendars.insert({
    resource: {
      summary: CALENDAR_NAME,
      timeZone: TIME_ZONE,
    },
  });

  console.log("New Dev Schedule calendar created:", created.result.id);
  return created.result.id;
}

async function deleteAllEventsFromDevScheduleCalendar() {
  let pageToken = null;

  do {
    const result = await gapi.client.calendar.events.list({
      calendarId: devScheduleCalendarId,
      maxResults: 2500,
      singleEvents: false,
      showDeleted: false,
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
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const today = new Date();
  const target = days.indexOf(dayName);
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

function makeManilaDateTime(baseDate, hour, minute, addDays = 0) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + addDays);

  const date = formatDate(d);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");

  return `${date}T${hh}:${mm}:00+08:00`;
}

async function insertRecurringEvent(dayName, block) {
  const baseDate = getNextDateForDay(dayName);

  let endHour = block.eh;
  let endAddDays = 0;

  if (block.eh === 24) {
    endHour = 0;
    endAddDays = 1;
  }

  await gapi.client.calendar.events.insert({
    calendarId: devScheduleCalendarId,
    resource: {
      summary: block.label,
      description: block.sub || "From Dev Schedule",
      start: {
        dateTime: makeManilaDateTime(baseDate, block.sh, block.sm),
        timeZone: TIME_ZONE,
      },
      end: {
        dateTime: makeManilaDateTime(baseDate, endHour, block.em, endAddDays),
        timeZone: TIME_ZONE,
      },
      recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${DAY_CODES[dayName]}`],
    },
  });
}

async function createRecurringRoutineEvents() {
  let created = 0;

  for (const dayName of Object.keys(WEEKLY)) {
    const blocks = buildDailyBlocks(dayName);

    for (const block of blocks) {
      await insertRecurringEvent(dayName, block);
      created++;
    }
  }

  console.log(`Created ${created} recurring events.`);
}
// ==================== DATA ====================

const EVENING_TEMPLATE = [
  {
    key: "main",
    sh: 21,
    sm: 0,
    eh: 22,
    em: 30,
    type: "work",
    color: "#1D9E75",
  },
  {
    key: "uni",
    sh: 22,
    sm: 30,
    eh: 23,
    em: 30,
    type: "university",
    color: "#7F77DD",
  },
  {
    key: "sec",
    sh: 23,
    sm: 30,
    eh: 24,
    em: 0,
    type: "secondary",
    color: "#EF9F27",
  },
];

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
    },
    // dynamic evening blocks
    {
      sh: 21,
      sm: 0,
      eh: 23,
      em: 30,
      label: f.main,
      sub: "Highest-priority project — full focus block",
      type: f.mainType,
      color: PROJ_COLORS[f.mainType] || "#1D9E75",
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
    sched: "2-3 days/weeek",
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

function getActiveBlock(blocks) {
  const m = nowMins();

  for (const b of blocks) {
    const s = toMins(b.sh, b.sm);
    const e = toMins(b.eh, b.em);

    if (b.label === "Sleep") {
      if (m < 300) return b;
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
  const dayName = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][new Date().getDay()];

  const BLOCKS = buildDailyBlocks(dayName);
  const tl = document.getElementById("timeline");
  const active = getActiveBlock(BLOCKS);

  const display = BLOCKS.slice(1);
  display.push(BLOCKS[0]);

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
  const dayName = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][new Date().getDay()];

  const BLOCKS = buildDailyBlocks(dayName);
  const b = getActiveBlock(BLOCKS);

  const nameEl = document.getElementById("nowName");
  const timeEl = document.getElementById("nowTime");

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
  const todayName = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][new Date().getDay()];
  const grid = document.getElementById("weekGrid");
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
  el.classList.add("selected");
  renderDayDetail(day);
}

function renderDayDetail(day) {
  const detail = document.getElementById("dayDetail");
  const f = WEEKLY[day];
  const todayName = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][new Date().getDay()];
  const isToday = day === todayName;
  const mc = PROJ_COLORS[f.mainType] || "#888";
  const sc = PROJ_COLORS[f.secType] || "#888";
  const uc = "#7F77DD";

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
          <div class="proj-detail-block"><div class="proj-detail-title">Engine / Platform</div><div class="proj-detail-val"><code style="color:${c}">${p.engine}</code></div></div>
          <div class="proj-detail-block"><div class="proj-detail-title">Team</div><div class="proj-detail-val">${p.team}</div></div>
          <div class="proj-detail-block"><div class="proj-detail-title">Recommended Schedule</div><div class="proj-detail-val">${p.sched}</div></div>
          <div class="proj-detail-block"><div class="proj-detail-title">Tags</div><div class="proj-tags">${p.tags.map((t) => `<span class="proj-tag" style="background:${c}22;color:${c}">${t}</span>`).join("")}</div></div>
          <div class="proj-detail-block full"><div class="proj-detail-title">Focus Note</div><div class="proj-detail-val">${p.focus}</div></div>
        </div>
      </div>
    </div>`;
  }).join("");
}

function toggleProject(num) {
  document.getElementById(`proj-${num}`).classList.toggle("open");
}

function switchTab(name, btn) {
  document
    .querySelectorAll(".tab-panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`tab-${name}`).classList.add("active");
  btn.classList.add("active");
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

  document.getElementById("liveClock").textContent = `${hh}:${m}:${s} ${ap}`;
  document.getElementById("liveDate").textContent =
    `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()]}, ` +
    `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][now.getMonth()]} ${now.getDate()}`;

  updateNowBanner();
}
