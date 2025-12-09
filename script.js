document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('taskInput');
    const recurrenceSelect = document.getElementById('recurrenceSelect'); // New
    const addTaskBtn = document.getElementById('addTaskBtn');
    const columns = document.querySelectorAll('.task-list');

    // Load tasks from LocalStorage
    let tasks = JSON.parse(localStorage.getItem('tasks')) || [];

    // Check for date change and move tasks based on dueDate
    const lastVisitDate = localStorage.getItem('lastVisitDate');
    const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (lastVisitDate && lastVisitDate !== todayDate) {
        migrateTasksForNewDay(todayDate);
        saveTasks();
    }
    localStorage.setItem('lastVisitDate', todayDate);

    // Initial Render
    renderTasks();

    // Event Listeners
    addTaskBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    // Drag and Drop Logic
    let draggedItem = null;

    columns.forEach(column => {
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(column, e.clientY);
            const draggable = document.querySelector('.dragging');
            if (afterElement == null) {
                column.appendChild(draggable);
            } else {
                column.insertBefore(draggable, afterElement);
            }
        });

        column.addEventListener('drop', (e) => {
            e.preventDefault();
            const newCategory = column.dataset.category;
            if (draggedItem) {
                const id = draggedItem.dataset.id;
                updateTaskCategory(id, newCategory);
            }
        });
    });

    function migrateTasksForNewDay(today) {
        tasks = tasks.map(task => {
            // Logic:
            // 1. If category is 'today' and it's a new day -> move to 'missed'
            // 2. If task has a dueDate:
            //    - if dueDate < today (overdue) -> 'missed' (unless already done)
            //    - if dueDate === today -> 'today'
            //    - if dueDate > today -> 'later' or 'tomorrow' accordingly

            if (task.completed) return task;

            const taskDate = task.dueDate ? task.dueDate : null;

            // Legacy support or manual move fallback
            if (task.category === 'today' && (!taskDate || taskDate < today)) {
                return { ...task, category: 'missed' };
            }

            // Promotion logic based on date
            if (taskDate) {
                if (taskDate < today) return { ...task, category: 'missed' };
                if (taskDate === today) return { ...task, category: 'today' };

                // Optional: Check if tomorrow
                const tomorrow = new Date();
                tomorrow.setDate(new Date().getDate() + 1);
                const tomorrowStr = tomorrow.toISOString().split('T')[0];

                if (taskDate === tomorrowStr) return { ...task, category: 'tomorrow' };
                // Keep as later if date is further out
            }

            return task;
        });
    }

    function addTask() {
        const text = taskInput.value.trim();
        const recurrence = recurrenceSelect.value;
        const today = new Date().toISOString().split('T')[0];

        if (text) {
            const newTask = {
                id: Date.now().toString(),
                text: text,
                category: 'today', // Default to today
                completed: false,
                createdAt: new Date().toISOString(),
                recurrence: recurrence,
                dueDate: today // Set initial due date to today
            };
            tasks.push(newTask);
            saveTasks();
            renderTasks();
            taskInput.value = '';
            recurrenceSelect.value = 'none'; // Reset select
        }
    }

    function renderTasks() {
        // Clear all columns
        columns.forEach(col => col.innerHTML = '');

        // Reset counts
        document.querySelectorAll('.count').forEach(c => c.textContent = '0');

        tasks.sort((a, b) => { // Sort by date if available, then creation
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            return 0;
        });

        tasks.forEach(task => {
            const card = createTaskElement(task);
            const column = document.querySelector(`.task-list[data-category="${task.category}"]`);
            if (column) {
                column.appendChild(card);
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

        // Debug date display (optional, can be removed)
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
            <button class="delete-btn" onclick="deleteTask('${task.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        `;

        // Checkbox listener
        const checkbox = div.querySelector('.task-checkbox');
        checkbox.addEventListener('change', (e) => {
            toggleTaskCompletion(task.id, e.target.checked);
        });

        div.addEventListener('dragstart', (e) => {
            div.classList.add('dragging');
            draggedItem = div;
            e.dataTransfer.effectAllowed = 'move';
        });

        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
            draggedItem = null;
        });

        // Delete button listener
        div.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent drag start
            deleteTask(task.id);
        });

        return div;
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

    window.deleteTask = function (id) {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        renderTasks();
    };

    function updateTaskCategory(id, newCategory) {
        const taskIndex = tasks.findIndex(t => t.id === id);
        if (taskIndex > -1) {
            const task = tasks[taskIndex];
            task.category = newCategory;

            // Update dueDate based on category drop
            const today = new Date();
            if (newCategory === 'today') {
                task.dueDate = today.toISOString().split('T')[0];
            } else if (newCategory === 'tomorrow') {
                const tmr = new Date(today);
                tmr.setDate(tmr.getDate() + 1);
                task.dueDate = tmr.toISOString().split('T')[0];
            } else if (newCategory === 'later') {
                // If moving to later, we keep the existing date if it's future, 
                // or maybe clear it? For now let's keep it but it might cause it to jump back if date is today.
                // Better approach: If date is <= today, set it to "no specific date" or next week?
                // Let's just leave it alone for manual drops for now, user desires visual organization primarily.
                // BUT, our migration logic relies on date. So if I drop 'today' task to 'later', 
                // on refresh it will jump back to 'today' if I don't change date.
                // Let's set date to null/undefined if dropped in later? Or +7 days?
                // Decision: clear date if dropped to 'later' or 'missed' so it doesn't auto-migrate back immediately.
                if (task.dueDate && task.dueDate <= today.toISOString().split('T')[0]) {
                    task.dueDate = null;
                }
            } else if (newCategory === 'missed') {
                // Typically means past.
            }

            saveTasks();
            renderTasks();
            updateCounts();
        }
    }

    function toggleTaskCompletion(id, isCompleted) {
        const taskIndex = tasks.findIndex(t => t.id === id);
        if (taskIndex > -1) {
            const task = tasks[taskIndex];
            task.completed = isCompleted;

            // Handle Recurrence
            if (isCompleted && task.recurrence && task.recurrence !== 'none') {
                const nextDate = calculateNextDate(task.dueDate || new Date().toISOString().split('T')[0], task.recurrence);

                // Create next task instance
                const nextTask = {
                    ...task,
                    id: Date.now().toString(), // New ID
                    completed: false,
                    dueDate: nextDate,
                    category: getCategoryForDate(nextDate)
                };

                // Add next task
                tasks.push(nextTask);

                // Optional: Strip recurrence from the completed task so it doesn't spawn again if toggled? 
                // Usually completed instance is history. Let's keep it simple.
                // If I uncheck the completed task, I probably don't want to delete the new one automatically (too complex).
            }

            saveTasks();
            renderTasks();
        }
    }

    function calculateNextDate(baseDateStr, recurrence) {
        const date = new Date(baseDateStr);

        switch (recurrence) {
            case 'daily':
                date.setDate(date.getDate() + 1);
                break;
            case 'workdays':
                // Add 1 day, then if Sat/Sun move to Mon
                do {
                    date.setDate(date.getDate() + 1);
                } while (date.getDay() === 0 || date.getDay() === 6);
                break;
            case 'weekly':
                date.setDate(date.getDate() + 7);
                break;
            case 'monthly':
                date.setMonth(date.getMonth() + 1);
                break;
            case 'yearly':
                date.setFullYear(date.getFullYear() + 1);
                break;
        }
        return date.toISOString().split('T')[0];
    }

    function getCategoryForDate(dateStr) {
        const today = new Date().toISOString().split('T')[0];

        const tmr = new Date();
        tmr.setDate(tmr.getDate() + 1);
        const tomorrow = tmr.toISOString().split('T')[0];

        if (dateStr === today) return 'today';
        if (dateStr === tomorrow) return 'tomorrow';
        if (dateStr < today) return 'missed';
        return 'later';
    }

    function saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    function updateCounts() {
        const counts = {
            missed: 0,
            today: 0,
            tomorrow: 0,
            later: 0
        };

        tasks.forEach(task => {
            if (counts[task.category] !== undefined) {
                counts[task.category]++;
            }
        });

        Object.keys(counts).forEach(key => {
            const column = document.getElementById(key);
            if (column) {
                column.querySelector('.count').textContent = counts[key];
            }
        });
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
});
