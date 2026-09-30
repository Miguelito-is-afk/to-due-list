const STORAGE_KEY = "to-due-list-tasks";

const dialog = document.querySelector("#addTaskDialog");
const form = document.querySelector("#addTaskForm");
const taskList = document.querySelector("#taskList");
const emptyState = document.querySelector("#emptyState");
const formError = document.querySelector("#taskFormError");

document.querySelector("#todayDate").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());

function loadTasks() {
  try {
    const savedTasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(savedTasks)
      ? savedTasks.filter((task) => task && typeof task === "object" && task.id)
      : [];
  } catch {
    return [];
  }
}

let tasks = loadTasks();

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch {
    return false;
  }
}

function createTaskId() {
  let number = 1;
  while (tasks.some((task) => task.id === `task-${number}`)) {
    number += 1;
  }
  return `task-${number}`;
}

function formatDueDate(date, time) {
  const due = new Date(`${date}T${time}`);
  if (Number.isNaN(due.getTime())) return `${date} · ${time}`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(due);
}

function renderTasks() {
  taskList.replaceChildren();
  emptyState.hidden = tasks.length > 0;

  tasks.forEach((task) => {
    const card = document.createElement("article");
    card.className = `task${task.completed ? " completed" : ""}`;

    const label = document.createElement("label");
    label.className = "checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(task.completed);
    checkbox.setAttribute("aria-label", `Mark ${task.name || "task"} complete`);
    checkbox.addEventListener("change", () => {
      task.completed = checkbox.checked;
      saveTasks();
      renderTasks();
    });

    const checkmark = document.createElement("span");
    label.append(checkbox, checkmark);

    const text = document.createElement("div");
    text.className = "task-text";

    const nameRow = document.createElement("div");
    nameRow.className = "task-name";

    const name = document.createElement("h4");
    name.textContent = task.name || "Untitled task";
    nameRow.append(name);

    if (task.reminder) {
      const reminderTag = document.createElement("span");
      reminderTag.className = "tag tomorrow-tag";
      reminderTag.textContent = "Reminder on";
      nameRow.append(reminderTag);
    }

    const details = document.createElement("p");
    details.textContent = task.subject || "";

    if (task.dueDate && task.dueTime) {
      const due = document.createElement("small");
      due.className = "task-due";
      due.textContent = `Due ${formatDueDate(task.dueDate, task.dueTime)}`;
      text.append(due);
    }

    text.prepend(nameRow, details);
    card.append(label, text);
    taskList.append(card);
  });
}

function openDialog() {
  formError.textContent = "";
  if (!dialog.open) dialog.showModal();
  form.elements.name.focus();
}

function closeDialog() {
  if (dialog.open) dialog.close();
}

document.querySelector("#addTaskButton").addEventListener("click", openDialog);
document.querySelector("#emptyStateAddButton").addEventListener("click", openDialog);
document.querySelector("#closeTaskDialogButton").addEventListener("click", closeDialog);
document.querySelector("#cancelTaskButton").addEventListener("click", closeDialog);

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeDialog();
});

dialog.addEventListener("close", () => {
  form.reset();
  formError.textContent = "";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.textContent = "";

  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const subject = String(formData.get("subject") || "").trim();
  const dueDate = String(formData.get("dueDate") || "");
  const dueTime = String(formData.get("dueTime") || "");

  if (!name || !subject || !dueDate || !dueTime) {
    formError.textContent = "Please complete every required field.";
    return;
  }

  const task = {
    id: createTaskId(),
    name,
    subject,
    dueDate,
    dueTime,
    reminder: form.elements.reminder.checked,
    completed: false,
    steps: [],
  };

  tasks.unshift(task);
  if (!saveTasks()) {
    tasks.shift();
    formError.textContent = "This task couldn’t be saved in this browser. Please try again.";
    return;
  }

  renderTasks();
  closeDialog();
});

renderTasks();
