// Local Storage & JSON File Logic
// No Firebase imports anymore

document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('taskInput');
    const recurrenceSelect = document.getElementById('recurrenceSelect');
    const addTaskBtn = document.getElementById('addTaskBtn');
    const columns = document.querySelectorAll('.task-list');

    // New buttons
    const saveBtn = document.getElementById('saveBtn');
    const loadBtn = document.getElementById('loadBtn');
    const fileInput = document.getElementById('fileInput');

    let tasks = [];

    // --- Initialization ---

    loadTasksFromLocalStorage();

    // Event Listeners
    addTaskBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    const clearCompletedBtn = document.getElementById('clearCompletedBtn');
    if (clearCompletedBtn) {
        clearCompletedBtn.addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите удалить все выполненные задачи?')) {
                tasks = tasks.filter(t => !t.completed);
                saveTasksToLocalStorage();
                renderTasks();
            }
        });
    }

    // JSON Save/Load Listeners
    saveBtn.addEventListener('click', saveTasksToJSON);
    loadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', loadTasksFromJSON);

    // Drag and Drop Logic
    columns.forEach(column => {
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(column, e.clientY);
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                if (afterElement == null) {
                    column.appendChild(draggable);
                } else {
                    column.insertBefore(draggable, afterElement);
                }
            }
        });

        column.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                const id = draggable.dataset.id;
                const newCategory = column.dataset.category;
                updateTaskCategory(id, newCategory);
            }
        });
    });

    // --- Core Functions ---

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function addTask() {
        const text = taskInput.value.trim();
        const recurrence = recurrenceSelect.value;
        const today = new Date().toISOString().split('T')[0];

        if (text) {
            const newTask = {
                id: generateId(),
                text: text,
                category: 'today',
                completed: false,
                createdAt: new Date().toISOString(),
                recurrence: recurrence,
                dueDate: today
            };

            tasks.push(newTask);
            saveTasksToLocalStorage();
            renderTasks();

            taskInput.value = '';
            recurrenceSelect.value = 'none';
        }
    }

    function deleteTask(id) {
        tasks = tasks.filter(t => t.id !== id);
        saveTasksToLocalStorage();
        renderTasks();
    }

    function updateTaskCategory(id, newCategory) {
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        // Same logic as before
        if (newCategory === 'completed') {
            if (!task.completed) {
                toggleTaskCompletion(id, true);
            }
            return;
        }

        task.completed = false;
        task.category = newCategory;

        const today = new Date();
        if (newCategory === 'today') {
            task.dueDate = today.toISOString().split('T')[0];
        } else if (newCategory === 'tomorrow') {
            const tmr = new Date(today);
            tmr.setDate(tmr.getDate() + 1);
            task.dueDate = tmr.toISOString().split('T')[0];
        } else if (newCategory === 'later') {
            // Keep existing due date if plausible, else clear it or set future? 
            // Original logic:
            if (task.dueDate && task.dueDate <= today.toISOString().split('T')[0]) {
                task.dueDate = null; // Reset due date if it was in past/present
            }
        }

        saveTasksToLocalStorage(); // Persist
        renderTasks();
    }

    function toggleTaskCompletion(id, isCompleted) {
        const task = tasks.find(t => t.id === id);
        if (!task) return;

        task.completed = isCompleted;
        if (isCompleted) {
            // task.category = 'completed'; // Visual only, usually we keep category prop? 
            // Actually original code didn't force category change on data level strictly, 
            // but UI put it in completed col.

            // Handle Recurrence
            if (task.recurrence && task.recurrence !== 'none') {
                const nextDate = calculateNextDate(task.dueDate || new Date().toISOString().split('T')[0], task.recurrence);
                const nextCategory = getCategoryForDate(nextDate);

                const nextTask = {
                    id: generateId(),
                    text: task.text,
                    category: nextCategory,
                    completed: false,
                    createdAt: new Date().toISOString(),
                    recurrence: task.recurrence,
                    dueDate: nextDate
                };
                tasks.push(nextTask);
            }
        }

        saveTasksToLocalStorage();
        renderTasks();
    }

    // --- Persistence & Migration ---

    function saveTasksToLocalStorage() {
        localStorage.setItem('localTasks', JSON.stringify(tasks));
        localStorage.setItem('lastVisitDate', new Date().toISOString().split('T')[0]);
    }

    function loadTasksFromLocalStorage() {
        const stored = localStorage.getItem('localTasks');
        if (stored) {
            try {
                tasks = JSON.parse(stored);
            } catch (e) {
                console.error("Failed to parse local tasks", e);
                tasks = [];
            }
        }

        // Check for day migration
        const lastVisitDate = localStorage.getItem('lastVisitDate');
        const todayDate = new Date().toISOString().split('T')[0];
        if (lastVisitDate && lastVisitDate !== todayDate) {
            migrateTasksForNewDay(todayDate);
        }

        renderTasks();
    }

    function migrateTasksForNewDay(today) {
        let hasUpdates = false;
        tasks.forEach(task => {
            if (task.completed) return;

            const taskDate = task.dueDate || null;
            let newCategory = null;

            if (task.category === 'today' && (!taskDate || taskDate < today)) {
                newCategory = 'missed';
            } else if (taskDate) {
                if (taskDate < today && task.category !== 'missed') newCategory = 'missed';
                if (taskDate === today && task.category !== 'today') newCategory = 'today';
                const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
                const tmrStr = tmr.toISOString().split('T')[0];
                if (taskDate === tmrStr && task.category !== 'tomorrow') newCategory = 'tomorrow';
            }

            if (newCategory) {
                task.category = newCategory;
                hasUpdates = true;
            }
        });

        if (hasUpdates) {
            console.log("Tasks migrated for new day");
            saveTasksToLocalStorage();
        }
    }

    // --- JSON File Operations ---

    function saveTasksToJSON() {
        const dataStr = JSON.stringify(tasks, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `tasks_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function loadTasksFromJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const importedTasks = JSON.parse(e.target.result);
                if (Array.isArray(importedTasks)) {
                    if (confirm(`Загрузить ${importedTasks.length} задач? Текущие задачи будут заменены.`)) {
                        tasks = importedTasks;
                        saveTasksToLocalStorage();
                        renderTasks();
                        alert("Задачи успешно загружены!");
                    }
                } else {
                    alert("Ошибка: Неверный формат файла.");
                }
            } catch (error) {
                console.error("Error parsing JSON:", error);
                alert("Ошибка при чтении файла.");
            }
            fileInput.value = ''; // Reset input
        };
        reader.readAsText(file);
    }

    // --- UI/Helper Functions ---

    function renderTasks() {
        columns.forEach(col => col.innerHTML = '');
        document.querySelectorAll('.count').forEach(c => c.textContent = '0');

        tasks.sort((a, b) => {
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            return 0;
        });

        tasks.forEach(task => {
            const card = createTaskElement(task);
            if (task.completed) {
                const completedColumn = document.querySelector('.task-list[data-category="completed"]');
                if (completedColumn) completedColumn.appendChild(card);
            } else {
                const column = document.querySelector(`.task-list[data-category="${task.category}"]`);
                if (column) column.appendChild(card);
            }
        });

        updateCounts();
    }

    function createTaskElement(task) {
        const div = document.createElement('div');
        div.className = `task-card ${task.completed ? 'completed' : ''}`;
        div.setAttribute('draggable', 'true');
        div.dataset.id = task.id;

        let recurrenceBadge = '';
        if (task.recurrence && task.recurrence !== 'none') {
            recurrenceBadge = `<span class="recurrence-badge">🔄 ${getRecurrenceLabel(task.recurrence)}</span>`;
        }

        let dateDisplay = '';
        if (task.category === 'later' && task.dueDate) {
            dateDisplay = `<span class="date-badge">📅 ${task.dueDate}</span>`;
        }

        div.innerHTML = `
            <div class="checkbox-wrapper">
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                <span class="custom-checkbox"></span>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                <span class="task-content">${task.text}</span>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${recurrenceBadge}
                    ${dateDisplay}
                </div>
            </div>
            <button class="delete-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        `;

        const checkbox = div.querySelector('.task-checkbox');
        checkbox.addEventListener('change', (e) => {
            toggleTaskCompletion(task.id, e.target.checked);
        });

        div.addEventListener('dragstart', (e) => {
            div.classList.add('dragging');
        });

        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
        });

        div.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTask(task.id);
        });

        return div;
    }

    function updateCounts() {
        const counts = { missed: 0, today: 0, tomorrow: 0, later: 0, completed: 0 };
        tasks.forEach(task => {
            if (task.completed) counts.completed++;
            else if (counts[task.category] !== undefined) counts[task.category]++;
        });
        Object.keys(counts).forEach(key => {
            const column = document.getElementById(key);
            if (column) column.querySelector('.count').textContent = counts[key];
        });
    }

    function getRecurrenceLabel(type) {
        const map = {
            'daily': 'Каждый день',
            'workdays': 'По будням',
            'weekly': 'Раз в неделю',
            'monthly': 'Раз в месяц',
            'yearly': 'Раз в год'
        };
        return map[type] || type;
    }

    function calculateNextDate(baseDateStr, recurrence) {
        const date = new Date(baseDateStr);
        switch (recurrence) {
            case 'daily': date.setDate(date.getDate() + 1); break;
            case 'workdays':
                do { date.setDate(date.getDate() + 1); } while (date.getDay() === 0 || date.getDay() === 6);
                break;
            case 'weekly': date.setDate(date.getDate() + 7); break;
            case 'monthly': date.setMonth(date.getMonth() + 1); break;
            case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
        }
        return date.toISOString().split('T')[0];
    }

    function getCategoryForDate(dateStr) {
        const today = new Date().toISOString().split('T')[0];
        const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
        const tomorrow = tmr.toISOString().split('T')[0];
        if (dateStr === today) return 'today';
        if (dateStr === tomorrow) return 'tomorrow';
        if (dateStr < today) return 'missed';
        return 'later';
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
            else return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
});
