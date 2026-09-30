const STORAGE_KEY = "to-due-list-tasks";
const dialog = document.querySelector("#addTaskDialog");
const form = document.querySelector("#addTaskForm");
const taskList = document.querySelector("#taskList");
const emptyState = document.querySelector("#emptyState");
const formError = document.querySelector("#taskFormError");
const filterButtons = document.querySelectorAll("[data-task-filter]");
const todayDate = document.querySelector("#todayDate");
const reminder = document.querySelector("#todayDueReminder");
const breakdownDialog = createDialog("breakdownDialog", "Break down a task");
const moveDialog = createDialog("moveDialog", "Move to another day");
let taskFilter = "all";
let editingTaskId = null;
let selectedBreakdownTaskId = "";
let moveSelection = null;
let selectedDate = dateKey(new Date());
let displayedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let toastTimeout;

function createDialog(id, title) {
  const element = document.createElement("dialog");
  element.id = id;
  element.className = "task-dialog";
  element.setAttribute("aria-labelledby", `${id}Title`);
  element.innerHTML = `
    <div class="task-form">
      <div class="dialog-heading">
        <div><span class="label">TO-DUE LIST</span><h2 id="${id}Title">${title}</h2></div>
        <button class="dialog-close" type="button" data-close-dialog aria-label="Close dialog">×</button>
      </div>
      <div class="dialog-content"></div>
    </div>`;
  document.body.append(element);
  element.addEventListener("click", (event) => {
    if (event.target === element || event.target.closest("[data-close-dialog]")) {
      element.close();
    }
  });
  element.addEventListener("cancel", (event) => {
    event.preventDefault();
    element.close();
  });
  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      element.close();
    }
  });
  return element;
}

function showMessage(message) {
  let toast = document.querySelector("#appMessage");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appMessage";
    toast.className = "app-message";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 4500);
}

function checkReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  tasks.forEach((task) => {
    if (!task.reminder || task.completed || !isValidDateKey(task.dueDate) || !isValidTime(task.dueTime)) return;
    const due = new Date(`${task.dueDate}T${task.dueTime}`);
    const leadTime = task.reminderTiming === "1h" ? 60 * 60 * 1000
      : task.reminderTiming === "3h" ? 3 * 60 * 60 * 1000
        : 0;
    const trigger = new Date(due.getTime() - leadTime);
    const isEligible = task.reminderTiming === "overdue"
      ? now > due
      : now >= trigger && now <= due;
    if (!isEligible) return;
    const key = `to-due-list-reminder:${task.id}:${task.dueDate}:${task.dueTime}:${task.reminderTiming}`;
    try {
      if (localStorage.getItem(key)) return;
      new Notification(task.reminderTiming === "overdue" ? "Task overdue" : "Task due soon", {
        body: `${task.name} · ${task.subject}`,
        tag: key,
      });
      localStorage.setItem(key, "sent");
    } catch (error) {
      console.error("Could not deliver or save a browser reminder.", error);
      showMessage("A browser reminder could not be delivered.");
    }
  });
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value;
}

function isValidTime(value) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours < 24 && minutes < 60;
}

function normalizeStep(step, index) {
  if (!step || typeof step !== "object") return null;
  return {
    id: typeof step.id === "string" && step.id ? step.id : `step-${index + 1}`,
    name: typeof step.name === "string" ? step.name.trim().slice(0, 120) : "",
    date: isValidDateKey(step.date) ? step.date : "",
    completed: step.completed === true || step.done === true,
    completedAt: typeof step.completedAt === "string" ? step.completedAt : "",
  };
}

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`}`;
}

function normalizeTasks(saved) {
  if (!Array.isArray(saved)) return [];
  const ids = new Set();
  return saved.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    let id = typeof item.id === "string" && item.id.trim() ? item.id : makeId("task");
    while (ids.has(id)) id = makeId("task");
    ids.add(id);
    return [{
      id,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 120) : "Untitled task",
      subject: typeof item.subject === "string" && item.subject.trim() ? item.subject.trim().slice(0, 80) : "No subject",
      dueDate: isValidDateKey(item.dueDate) ? item.dueDate : "",
      dueTime: isValidTime(item.dueTime) ? item.dueTime : "",
      reminder: typeof item.reminder === "boolean"
        ? item.reminder
        : ["1h", "3h", "deadline", "overdue"].includes(item.reminderTiming),
      reminderTiming: ["1h", "3h", "deadline", "overdue"].includes(item.reminderTiming)
        ? item.reminderTiming
        : "deadline",
      completed: item.completed === true,
      completedAt: typeof item.completedAt === "string" ? item.completedAt : "",
      steps: Array.isArray(item.steps)
        ? item.steps.map(normalizeStep).filter((step) => step && step.name)
        : [],
    }];
  });
}

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeTasks(JSON.parse(stored)) : [];
  } catch (error) {
    console.error("Could not load tasks from localStorage.", error);
    showMessage("Saved tasks could not be read in this browser.");
    return [];
  }
}

let tasks = loadTasks();

function updateTasks(change) {
  const previousTasks = JSON.parse(JSON.stringify(tasks));
  change();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    tasks = previousTasks;
    console.error("Could not save tasks to localStorage.", error);
    showMessage("Your change could not be saved. Check this browser's storage settings.");
    return false;
  }
  renderPage();
  return true;
}

function formatDueDate(date, time) {
  if (!isValidDateKey(date)) return "Date not set";
  const due = new Date(`${date}T${time || "12:00"}`);
  const today = dateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateLabel = date === today
    ? "Today"
    : date === dateKey(tomorrow)
      ? "Tomorrow"
      : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(due);
  return `${dateLabel}${time ? ` · ${formatDueTime(time)}` : ""}`;
}

function formatDueTime(time) {
  if (!isValidTime(time)) return "Time not set";
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function isOverdue(task) {
  if (task.completed || !isValidDateKey(task.dueDate) || !isValidTime(task.dueTime)) return false;
  const due = new Date(`${task.dueDate}T${task.dueTime}`);
  return !Number.isNaN(due.getTime()) && due < new Date();
}

function taskCategory(task) {
  if (task.completed) return "completed";
  if (!isValidDateKey(task.dueDate)) return "later";
  if (isOverdue(task) || task.dueDate === dateKey(new Date())) return "urgent";
  const soon = new Date();
  soon.setHours(0, 0, 0, 0);
  soon.setDate(soon.getDate() + 7);
  return task.dueDate <= dateKey(soon) ? "upcoming" : "later";
}

function getRemainingStepCount(task) {
  return task.steps.filter((step) => !step.completed).length;
}

function createTaskCard(task) {
  const card = document.createElement("article");
  card.className = `task${task.completed ? " completed" : ""}${isOverdue(task) ? " urgent" : ""}`;
  card.id = task.id;
  card.dataset.taskId = task.id;

  const label = document.createElement("label");
  label.className = "checkbox";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.dataset.taskCheck = "";
  checkbox.setAttribute("aria-label", `Mark ${task.name} complete`);
  label.append(checkbox, document.createElement("span"));

  const text = document.createElement("div");
  text.className = "task-text";
  const nameRow = document.createElement("div");
  nameRow.className = "task-name";
  const name = document.createElement("h4");
  name.textContent = task.name;
  nameRow.append(name);
  const tag = document.createElement("span");
  tag.className = `tag ${task.completed ? "done-tag" : taskCategory(task) === "urgent" ? "urgent-tag" : "tomorrow-tag"}`;
  const categoryLabel = taskCategory(task);
  tag.textContent = task.completed
    ? "Completed"
    : isOverdue(task)
      ? "Overdue"
      : categoryLabel === "urgent"
      ? "Due today"
      : `${categoryLabel[0].toUpperCase()}${categoryLabel.slice(1)}`;
  nameRow.append(tag);
  const subject = document.createElement("p");
  subject.textContent = task.subject;
  text.append(nameRow, subject);
  if (task.completed) {
    const status = document.createElement("small");
    status.className = "task-status completed-status";
    status.textContent = "Completed";
    text.append(status);
  } else {
    const due = document.createElement("small");
    due.className = `task-due${isOverdue(task) ? " overdue" : " upcoming"}`;
    due.textContent = `Due ${formatDueDate(task.dueDate, task.dueTime)}`;
    text.append(due);
    const steps = document.createElement("small");
    const remaining = getRemainingStepCount(task);
    steps.className = "task-step-status";
    steps.textContent = `${remaining} step${remaining === 1 ? "" : "s"} remaining`;
    text.append(steps);
  }
  if (task.reminder) {
    const reminderTag = document.createElement("small");
    reminderTag.textContent = `Reminder: ${reminderText(task.reminderTiming)}`;
    text.append(reminderTag);
  }

  const controls = document.createElement("div");
  controls.className = "task-controls";
  [
    ["edit", "Edit"],
    ["breakdown", "Break down"],
    ["move", "Move"],
    ["delete", "Delete"],
  ].forEach(([action, labelText]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "task-action";
    button.dataset.taskAction = action;
    button.textContent = labelText;
    controls.append(button);
  });
  card.append(label, text, controls);

  if (task.steps.length) {
    const stepList = document.createElement("div");
    stepList.className = "task-step-list";
    task.steps.forEach((step) => {
      const row = document.createElement("div");
      row.className = `task-step${step.completed ? " is-complete" : ""}`;
      const stepLabel = document.createElement("label");
      stepLabel.className = "step-checkbox";
      const stepCheck = document.createElement("input");
      stepCheck.type = "checkbox";
      stepCheck.checked = step.completed;
      stepCheck.dataset.stepCheck = step.id;
      stepCheck.setAttribute("aria-label", `Mark step ${step.name} complete`);
      const stepName = document.createElement("span");
      stepName.textContent = step.name;
      stepLabel.append(stepCheck, stepName);
      row.append(stepLabel);
      if (step.date) {
        const stepDate = document.createElement("small");
        stepDate.textContent = formatDueDate(step.date, "");
        row.append(stepDate);
      }
      const moveStep = document.createElement("button");
      moveStep.type = "button";
      moveStep.className = "task-action";
      moveStep.dataset.moveStep = step.id;
      moveStep.textContent = "Move step";
      row.append(moveStep);
      stepList.append(row);
    });
    card.append(stepList);
  }
  return card;
}

function renderTaskList() {
  if (!taskList || !emptyState) return;
  const isHome = document.querySelector(".current-page")?.textContent.trim() === "Home";
  let visible = tasks;
  if (isHome) {
    const today = dateKey(new Date());
    visible = tasks.filter((task) =>
      task.dueDate === today || task.steps.some((step) => !step.completed && step.date === today),
    );
  } else if (taskFilter !== "all") {
    visible = tasks.filter((task) => taskCategory(task) === taskFilter);
  }
  visible = [...visible].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99")
      || (a.dueTime || "").localeCompare(b.dueTime || "");
  });
  if (isHome) {
    taskList.replaceChildren(...visible.map(createTaskCard));
  } else {
    const labels = { urgent: "Urgent", upcoming: "Upcoming", later: "Later", completed: "Completed" };
    const categories = taskFilter === "all" ? Object.keys(labels) : [taskFilter];
    const fragments = [];
    categories.forEach((category) => {
      const grouped = visible.filter((task) => taskCategory(task) === category);
      if (!grouped.length) return;
      const heading = document.createElement("h4");
      heading.className = "task-group-heading";
      heading.textContent = `${labels[category]} · ${grouped.length}`;
      fragments.push(heading, ...grouped.map(createTaskCard));
    });
    taskList.replaceChildren(...fragments);
  }
  emptyState.hidden = visible.length > 0;
  const heading = emptyState.querySelector("h4");
  const message = emptyState.querySelector("p");
  const emptyButton = emptyState.querySelector("button");
  if (isHome && tasks.length) {
    heading.textContent = "Nothing due today.";
    message.textContent = "Enjoy the breathing room, or add something new.";
    emptyButton.hidden = false;
  } else if (!isHome && visible.length === 0 && tasks.length) {
    heading.textContent = "No tasks in this section.";
    message.textContent = "Try another category or add a task.";
    emptyButton.hidden = false;
  } else {
    heading.textContent = "Nothing on your list yet.";
    message.textContent = "Add the first thing you want to remember.";
    emptyButton.hidden = false;
  }
}

function reminderText(timing) {
  return { "1h": "1 hour before", "3h": "3 hours before", deadline: "at deadline", overdue: "when overdue" }[timing] || "at deadline";
}

function renderHomeSummary() {
  if (!reminder) return;
  const todayTasks = tasks.filter((task) => task.dueDate === dateKey(new Date()));
  const complete = todayTasks.filter((task) => task.completed).length;
  const percent = todayTasks.length ? Math.round((complete / todayTasks.length) * 100) : 0;
  const rate = document.querySelector("#todayProgressRate");
  const count = document.querySelector("#todayProgressCount");
  const segments = document.querySelector("#todayProgressSegments");
  if (rate && count && segments) {
    rate.textContent = `${percent}%`;
    count.textContent = todayTasks.length ? `${complete} of ${todayTasks.length} tasks completed · ${todayTasks.length - complete} remaining` : "No tasks due today";
    segments.setAttribute("aria-valuenow", String(percent));
    segments.replaceChildren(...Array.from({ length: 20 }, (_, index) => {
      const span = document.createElement("span");
      if (index < Math.round(percent / 5)) span.className = "is-filled";
      return span;
    }));
  }

  const nextTask = todayTasks.filter((task) => !task.completed).sort((a, b) => a.dueTime.localeCompare(b.dueTime))[0];
  reminder.hidden = !nextTask;
  if (nextTask) {
    reminder.dataset.taskId = nextTask.id;
    document.querySelector("#todayDueReminder .label").textContent = isOverdue(nextTask) ? "OVERDUE" : "DUE TODAY";
    document.querySelector("#todayDueTaskName").textContent = nextTask.name;
    document.querySelector("#todayDueTaskSteps").textContent = `${getRemainingStepCount(nextTask)} steps remaining`;
    document.querySelector("#todayDueTaskTime").textContent = formatDueTime(nextTask.dueTime);
    document.querySelector("#todayDueViewTask").href = `./tasks.html#${encodeURIComponent(nextTask.id)}`;
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning." : now.getHours() < 18 ? "Good afternoon." : "Good evening.";
  const greetingHeading = document.querySelector("#greetingHeading");
  if (greetingHeading) greetingHeading.textContent = greeting;
  if (todayDate) {
    todayDate.textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
  }
  const duration = getWorkload(dateKey(now));
  const workloadLabel = document.querySelector("#todayWorkloadLabel");
  const workloadDetails = document.querySelector("#todayWorkloadDetails");
  const workloadMessage = document.querySelector("#todayWorkloadMessage");
  if (workloadLabel && workloadDetails && workloadMessage) {
    workloadLabel.textContent = `${duration.level} workload`;
    workloadLabel.dataset.level = duration.level.toLowerCase();
    workloadDetails.textContent = `${duration.tasks} task${duration.tasks === 1 ? "" : "s"}${duration.steps ? ` + ${duration.steps} step${duration.steps === 1 ? "" : "s"}` : ""} · ~${formatMinutes(duration.minutes)} planned`;
    workloadMessage.textContent = duration.level === "Heavy" ? "Today looks heavy. Move an unfinished task to another day." : "";
  }
}

function getWorkload(date) {
  const dayTasks = tasks.filter((task) => !task.completed && task.dueDate === date);
  const daySteps = tasks.flatMap((task) => task.steps.filter((step) => !step.completed && step.date === date));
  const items = dayTasks.length + daySteps.length;
  const minutes = items * 30;
  return { tasks: dayTasks.length, steps: daySteps.length, minutes, level: items >= 6 || minutes >= 180 ? "Heavy" : items >= 3 || minutes >= 90 ? "Moderate" : "Light" };
}

function formatMinutes(minutes) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours}${remainder ? ` hr ${remainder} min` : " hr"}`;
  }
  return `${minutes} min`;
}

function renderCalendar() {
  const grid = document.querySelector("#calendarGrid");
  const monthLabel = document.querySelector("#calendarMonthLabel");
  if (!grid || !monthLabel) return;
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  monthLabel.textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(displayedMonth);
  const firstWeekday = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.max(35, Math.ceil((firstWeekday + count) / 7) * 7);
  const start = new Date(year, month, 1 - firstWeekday);
  const cells = [];
  for (let index = 0; index < totalCells; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const key = dateKey(date);
    const events = getCalendarEvents(key);
    const cell = document.createElement("article");
    cell.className = "calendar-day";
    cell.dataset.date = key;
    cell.tabIndex = 0;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `${new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date)}, ${events.length} items`);
    if (date.getMonth() !== month) cell.classList.add("outside-month");
    if (key === dateKey(new Date())) cell.classList.add("is-today");
    if (key === selectedDate) cell.classList.add("is-selected");
    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.textContent = String(date.getDate());
    cell.append(number);
    const eventList = document.createElement("div");
    eventList.className = "calendar-events";
    events.slice(0, 3).forEach((event) => {
      const item = document.createElement("span");
      item.className = `calendar-event${event.completed ? " is-complete" : ""}${event.type === "step" ? " step-event" : ""}`;
      item.textContent = event.label;
      eventList.append(item);
    });
    if (events.length > 3) {
      const more = document.createElement("small");
      more.textContent = `+${events.length - 3} more`;
      eventList.append(more);
    }
    cell.append(eventList);
    cells.push(cell);
  }
  grid.replaceChildren(...cells);
  renderCalendarAgenda();
}

function getCalendarEvents(date) {
  const events = [];
  tasks.forEach((task) => {
    if (task.dueDate === date) events.push({ type: "task", task, label: task.name, completed: task.completed });
    task.steps.forEach((step) => {
      if (step.date === date) events.push({ type: "step", task, step, label: `${step.name} · ${task.name}`, completed: step.completed });
    });
  });
  return events;
}

function renderCalendarAgenda() {
  const heading = document.querySelector("#calendarAgendaHeading");
  const list = document.querySelector("#calendarAgendaList");
  if (!heading || !list) return;
  const date = new Date(`${selectedDate}T00:00:00`);
  heading.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date);
  const events = getCalendarEvents(selectedDate);
  if (!events.length) {
    const message = document.createElement("p");
    message.className = "calendar-note";
    message.textContent = "No tasks or steps scheduled for this day.";
    list.replaceChildren(message);
    return;
  }
  list.replaceChildren(...events.map((event) => {
    const row = document.createElement("a");
    row.className = `agenda-item${event.completed ? " is-complete" : ""}`;
    row.href = `./tasks.html#${encodeURIComponent(event.task.id)}`;
    const name = document.createElement("strong");
    name.textContent = event.label;
    const detail = document.createElement("span");
    detail.textContent = event.type === "task"
      ? `${event.task.subject} · Due ${event.task.dueTime ? formatDueTime(event.task.dueTime) : "time not set"}`
      : `${event.completed ? "Step completed" : "Scheduled step"} · ${event.task.subject}`;
    row.append(name, detail);
    return row;
  }));
}

function weekStart(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function renderProgress() {
  const total = document.querySelector("#progressTotal");
  if (!total) return;
  const doneTasks = tasks.filter((task) => task.completed);
  const openTasks = tasks.filter((task) => !task.completed);
  const percent = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
  total.textContent = String(tasks.length);
  document.querySelector("#progressDone").textContent = String(doneTasks.length);
  document.querySelector("#progressOpen").textContent = String(openTasks.length);
  document.querySelector("#progressRate").textContent = `${percent}%`;
  document.querySelector("#progressFill").style.width = `${percent}%`;
  document.querySelector("#progressFill").parentElement.setAttribute("aria-valuenow", String(percent));
  document.querySelector("#progressMessage").textContent = tasks.length
    ? `${doneTasks.length} of ${tasks.length} tasks completed.`
    : "Add a task to start tracking your progress.";

  const todayKey = dateKey(new Date());
  const todayTasks = tasks.filter((task) => task.dueDate === todayKey);
  const todayDone = todayTasks.filter((task) => task.completed).length;
  const todayPercent = todayTasks.length ? Math.round((todayDone / todayTasks.length) * 100) : 0;
  const todayRate = document.querySelector("#todayProgressRate");
  if (todayRate) {
    todayRate.textContent = `${todayPercent}%`;
    document.querySelector("#todayProgressFill").style.width = `${todayPercent}%`;
    document.querySelector("#todayProgressFill").parentElement.setAttribute("aria-valuenow", String(todayPercent));
    document.querySelector("#todayProgressMessage").textContent = todayTasks.length
      ? `${todayDone} of ${todayTasks.length} tasks completed · ${todayTasks.length - todayDone} remaining`
      : "No tasks due today.";
  }

  const start = weekStart(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const weekTasks = tasks.filter((task) => isValidDateKey(task.dueDate) && task.dueDate >= dateKey(start) && task.dueDate < dateKey(end));
  const weeklyCompletions = tasks.filter((task) => {
    const completedDate = task.completedAt ? dateKey(new Date(task.completedAt)) : "";
    return task.completed && (completedDate >= dateKey(start) && completedDate < dateKey(end)
      || !task.completedAt && weekTasks.includes(task));
  });
  const weeklyDone = weeklyCompletions.length;
  const weeklyRemaining = weekTasks.filter((task) => !task.completed).length;
  const weekly = document.querySelector("#weeklySummary");
  if (weekly) {
    const completed = document.createElement("strong");
    completed.textContent = `${weeklyDone} completed`;
    const remaining = document.createElement("span");
    remaining.textContent = `${weeklyRemaining} remaining this week`;
    weekly.replaceChildren(completed, remaining);
  }

  const completedList = document.querySelector("#completedTaskList");
  if (completedList) {
    if (doneTasks.length) {
      completedList.replaceChildren(...doneTasks
        .slice()
        .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))
        .map((task) => {
          const item = document.createElement("div");
          item.className = "completed-task";
          const title = document.createElement("strong");
          title.textContent = task.name;
          const subject = document.createElement("span");
          subject.textContent = task.subject;
          item.append(title, subject);
          return item;
        }));
    } else {
      const empty = document.createElement("p");
      empty.className = "calendar-note";
      empty.textContent = "Completed tasks will show up here.";
      completedList.replaceChildren(empty);
    }
  }

  renderSubjectProgress();
}

function renderSubjectProgress() {
  const subjectList = document.querySelector("#subjectProgress");
  const empty = document.querySelector("#progressEmpty");
  if (!subjectList || !empty) return;
  subjectList.replaceChildren();
  empty.hidden = tasks.length > 0;
  const subjects = new Map();
  tasks.forEach((task) => {
    const counts = subjects.get(task.subject) || { total: 0, completed: 0 };
    counts.total += 1;
    if (task.completed) counts.completed += 1;
    subjects.set(task.subject, counts);
  });
  [...subjects.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([subject, counts]) => {
    const row = document.createElement("div");
    row.className = "subject-progress-row";
    const title = document.createElement("div");
    title.className = "subject-progress-heading";
    const name = document.createElement("strong");
    name.textContent = subject;
    const count = document.createElement("span");
    count.textContent = `${counts.completed} / ${counts.total}`;
    title.append(name, count);
    const track = document.createElement("div");
    track.className = "subject-progress-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `${subject} completion`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(counts.total));
    track.setAttribute("aria-valuenow", String(counts.completed));
    const fill = document.createElement("span");
    fill.style.width = `${(counts.completed / counts.total) * 100}%`;
    track.append(fill);
    row.append(title, track);
    subjectList.append(row);
  });
}

function renderPage() {
  renderTaskList();
  renderCalendar();
  renderProgress();
  renderHomeSummary();
  checkReminders();
}

function openTaskDialog(task = null) {
  if (!dialog || !form || !formError) return;
  editingTaskId = task?.id || null;
  form.reset();
  formError.textContent = "";
  document.querySelector("#addTaskDialogTitle").textContent = task ? "Edit task" : "Add a task";
  dialog.querySelector(".dialog-heading .label").textContent = task ? "UPDATE TASK" : "NEW TASK";
  dialog.querySelector('[type="submit"]').textContent = task ? "Save changes" : "Add Task";
  if (task) {
    form.elements.name.value = task.name;
    form.elements.subject.value = task.subject;
    form.elements.dueDate.value = task.dueDate;
    form.elements.dueTime.value = task.dueTime;
    form.elements.reminder.checked = task.reminder;
    form.elements.reminderTiming.value = task.reminderTiming;
  }
  form.elements.reminderTiming.disabled = !form.elements.reminder.checked;
  if (!dialog.open) dialog.showModal();
  form.elements.name.focus();
}

function closeDialog() {
  if (dialog?.open) dialog.close();
}

function renderBreakdown() {
  const content = breakdownDialog.querySelector(".dialog-content");
  const task = tasks.find((item) => item.id === selectedBreakdownTaskId) || tasks[0];
  if (!task) {
    content.innerHTML = `<p class="calendar-note">Add a task before creating steps.</p><button class="btn primary" type="button" data-add-first-task>Add Task</button>`;
    return;
  }
  selectedBreakdownTaskId = task.id;
  content.innerHTML = `
    <label class="form-field"><span>Choose a task</span><select name="breakdownTask"></select></label>
    <form class="step-add-form" id="stepAddForm">
      <label class="form-field"><span>Step name</span><input name="stepName" required maxlength="120" placeholder="e.g. Find three sources"></label>
      <label class="form-field"><span>Schedule for</span><input name="stepDate" type="date" required></label>
      <button class="btn primary" type="submit">Add step</button>
    </form>
    <div class="breakdown-step-list" id="breakdownStepList"></div>
    <div class="dialog-actions"><button class="btn primary" type="button" data-close-dialog>Save / Add to My Day</button></div>`;
  const select = content.querySelector('[name="breakdownTask"]');
  tasks.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.name} · ${item.subject}`;
    option.selected = item.id === task.id;
    select.append(option);
  });
  const dateInput = content.querySelector('[name="stepDate"]');
  dateInput.value = dateKey(new Date());
  const list = content.querySelector("#breakdownStepList");
  if (task.steps.length) {
    task.steps.forEach((step) => {
      const row = document.createElement("div");
      row.className = `breakdown-step${step.completed ? " is-complete" : ""}`;
      const label = document.createElement("label");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = step.completed;
      check.dataset.breakdownStepCheck = step.id;
      const name = document.createElement("span");
      name.textContent = step.name;
      label.append(check, name);
      const date = document.createElement("span");
      date.textContent = step.date ? formatDueDate(step.date, "") : "Unscheduled";
      const move = document.createElement("button");
      move.type = "button";
      move.className = "task-action";
      move.dataset.moveBreakdownStep = step.id;
      move.textContent = "Move";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "task-action delete-action";
      remove.dataset.removeStep = step.id;
      remove.textContent = "Remove";
      row.append(label, date, move, remove);
      list.append(row);
    });
  } else {
    list.innerHTML = `<p class="calendar-note">No steps yet. Add the first small action above.</p>`;
  }
  select.addEventListener("change", () => {
    selectedBreakdownTaskId = select.value;
    renderBreakdown();
  });
  content.querySelector("#stepAddForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const stepName = content.querySelector('[name="stepName"]').value.trim();
    const stepDate = content.querySelector('[name="stepDate"]').value;
    if (!stepName || !isValidDateKey(stepDate)) return;
    if (updateTasks(() => {
      const current = tasks.find((item) => item.id === selectedBreakdownTaskId);
      if (current) current.steps.push({ id: makeId("step"), name: stepName, date: stepDate, completed: false, completedAt: "" });
    })) renderBreakdown();
  });
}

function openBreakdown(taskId = "") {
  selectedBreakdownTaskId = taskId || tasks[0]?.id || "";
  renderBreakdown();
  breakdownDialog.showModal();
}

function openMoveDialog(taskId, stepId = "") {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  const step = task.steps.find((item) => item.id === stepId);
  moveSelection = { taskId, stepId };
  const content = moveDialog.querySelector(".dialog-content");
  content.innerHTML = `<form class="move-form">
    <p class="calendar-note">${step ? `Move “${escapeText(step.name)}” from` : `Move “${escapeText(task.name)}” from` } its current date.</p>
    <label class="form-field"><span>New date</span><input name="moveDate" type="date" required></label>
    <p class="form-error" role="alert"></p>
    <div class="dialog-actions"><button class="btn" type="button" data-close-dialog>Cancel</button><button class="btn primary" type="submit">Move</button></div>
  </form>`;
  const input = content.querySelector('[name="moveDate"]');
  input.value = step?.date || task.dueDate || dateKey(new Date());
  moveDialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    const date = input.value;
    if (!isValidDateKey(date)) {
      content.querySelector(".form-error").textContent = "Choose a valid date.";
      return;
    }
    const selection = moveSelection;
    if (!selection) return;
    const saved = updateTasks(() => {
      const current = tasks.find((item) => item.id === selection.taskId);
      if (!current) return;
      if (selection.stepId) {
        const currentStep = current.steps.find((item) => item.id === selection.stepId);
        if (currentStep) currentStep.date = date;
      } else {
        current.dueDate = date;
      }
    });
    if (saved) moveDialog.close();
  };
  moveDialog.showModal();
}

function escapeText(value) {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

document.querySelectorAll("[data-open-task-dialog], #addTaskButton, #emptyStateAddButton").forEach((button) => {
  button.addEventListener("click", () => openTaskDialog());
});
document.querySelector("#breakDownTaskButton")?.addEventListener("click", () => openBreakdown());
document.querySelector("#markTodayDueDone")?.addEventListener("click", () => {
  const task = tasks.find((item) => item.id === reminder?.dataset.taskId);
  if (task) updateTasks(() => {
    task.completed = true;
    task.completedAt = new Date().toISOString();
  });
});

filterButtons.forEach((button) => button.addEventListener("click", () => {
  taskFilter = button.dataset.taskFilter;
  filterButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  renderTaskList();
}));

taskList?.addEventListener("change", (event) => {
  const input = event.target;
  const card = input.closest("[data-task-id]");
  if (!card) return;
  const task = tasks.find((item) => item.id === card.dataset.taskId);
  if (!task) return;
  if (input.matches("[data-task-check]")) {
    updateTasks(() => {
      task.completed = input.checked;
      task.completedAt = input.checked ? new Date().toISOString() : "";
    });
  } else if (input.matches("[data-step-check]")) {
    const step = task.steps.find((item) => item.id === input.dataset.stepCheck);
    if (step) updateTasks(() => {
      step.completed = input.checked;
      step.completedAt = input.checked ? new Date().toISOString() : "";
    });
  }
});

taskList?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const card = event.target.closest("[data-task-id]");
  if (!button || !card) return;
  const task = tasks.find((item) => item.id === card.dataset.taskId);
  if (!task) return;
  if (button.dataset.taskAction === "edit") openTaskDialog(task);
  if (button.dataset.taskAction === "breakdown") openBreakdown(task.id);
  if (button.dataset.taskAction === "move") openMoveDialog(task.id);
  if (button.dataset.moveStep) openMoveDialog(task.id, button.dataset.moveStep);
  if (button.dataset.taskAction === "delete" && window.confirm(`Delete “${task.name}”? This cannot be undone.`)) {
    updateTasks(() => { tasks = tasks.filter((item) => item.id !== task.id); });
  }
});

document.querySelector("#calendarGrid")?.addEventListener("click", (event) => {
  const cell = event.target.closest("[data-date]");
  if (cell) {
    selectedDate = cell.dataset.date;
    renderCalendar();
  }
});
document.querySelector("#calendarGrid")?.addEventListener("keydown", (event) => {
  const cell = event.target.closest("[data-date]");
  if (cell && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    selectedDate = cell.dataset.date;
    renderCalendar();
  }
});
document.querySelector("#previousMonth")?.addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.querySelector("#nextMonth")?.addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
  renderCalendar();
});
document.querySelector("#todayMonth")?.addEventListener("click", () => {
  const today = new Date();
  displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  selectedDate = dateKey(today);
  renderCalendar();
});

breakdownDialog.addEventListener("change", (event) => {
  const check = event.target.closest("[data-breakdown-step-check]");
  if (!check) return;
  const task = tasks.find((item) => item.id === selectedBreakdownTaskId);
  const step = task?.steps.find((item) => item.id === check.dataset.breakdownStepCheck);
  if (step) {
    updateTasks(() => {
      step.completed = check.checked;
      step.completedAt = check.checked ? new Date().toISOString() : "";
    });
    renderBreakdown();
  }
});
breakdownDialog.addEventListener("click", (event) => {
  if (event.target.closest("[data-add-first-task]")) {
    breakdownDialog.close();
    openTaskDialog();
    return;
  }
  const removeButton = event.target.closest("[data-remove-step]");
  if (removeButton) {
    const task = tasks.find((item) => item.id === selectedBreakdownTaskId);
    if (task) {
      updateTasks(() => { task.steps = task.steps.filter((step) => step.id !== removeButton.dataset.removeStep); });
      renderBreakdown();
    }
  }
  const moveButton = event.target.closest("[data-move-breakdown-step]");
  if (moveButton) openMoveDialog(selectedBreakdownTaskId, moveButton.dataset.moveBreakdownStep);
});

dialog?.querySelector("#closeTaskDialogButton")?.addEventListener("click", closeDialog);
dialog?.querySelector("#cancelTaskButton")?.addEventListener("click", closeDialog);
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) closeDialog();
});
dialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
dialog?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeDialog();
  }
});
dialog?.addEventListener("close", () => {
  form.reset();
  formError.textContent = "";
  editingTaskId = null;
});
form?.elements.reminder?.addEventListener("change", () => {
  form.elements.reminderTiming.disabled = !form.elements.reminder.checked;
  if (!form.elements.reminder.checked || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission()
      .then((permission) => {
        if (permission === "granted") checkReminders();
        else showMessage("Browser notifications are off; due dates will still appear in the app.");
      })
      .catch((error) => {
        console.error("Could not request browser notification permission.", error);
        showMessage("Browser notification permission could not be requested.");
      });
  }
});
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.textContent = "";
  if (!form.reportValidity()) return;
  const name = form.elements.name.value.trim();
  const subject = form.elements.subject.value.trim();
  const dueDate = form.elements.dueDate.value;
  const dueTime = form.elements.dueTime.value;
  if (!name || !subject || !isValidDateKey(dueDate) || !isValidTime(dueTime)) {
    formError.textContent = "Enter a task, subject, valid date, and due time.";
    return;
  }
  const editing = editingTaskId && tasks.find((item) => item.id === editingTaskId);
  const taskData = {
    name,
    subject,
    dueDate,
    dueTime,
    reminder: form.elements.reminder.checked,
    reminderTiming: form.elements.reminderTiming.value,
  };
  const saved = updateTasks(() => {
    if (editing) Object.assign(editing, taskData);
    else tasks.unshift({ id: makeId("task"), ...taskData, completed: false, completedAt: "", steps: [] });
  });
  if (saved) closeDialog();
});

renderPage();
window.setInterval(checkReminders, 60 * 1000);
