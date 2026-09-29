import crypto from 'node:crypto';

const SNAPSHOT_SOURCE = 'account_snapshot';

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isComplete(task) {
  return Boolean(task?.completed_at && String(task.completed_at) !== '0');
}

function normalizeTask(task) {
  return {
    guid: task.guid || task.id || '',
    summary: String(task.summary || task.title || '').trim(),
    completed: isComplete(task),
    due: task.due?.timestamp || task.due?.date || '',
  };
}

function normalizeTaskList(readResult) {
  const tasklist = readResult?.tasklist || {};
  const tasks = (readResult?.tasks || []).map(normalizeTask).filter((task) => task.guid || task.summary);
  return {
    guid: readResult?.guid || tasklist.guid || '',
    name: tasklist.name || tasklist.title || tasklist.summary || readResult?.guid || 'Untitled task list',
    url: tasklist.url || '',
    taskCount: tasks.length,
    openCount: tasks.filter((task) => !task.completed).length,
    tasks,
  };
}

function normalizeDocument(document) {
  const content = String(document?.content || '');
  return {
    title: document?.title || 'Live timeline document',
    wikiToken: document?.wikiToken || '',
    documentId: document?.documentId || '',
    contentHash: hash(content),
    contentPreview: content.replace(/\s+/g, ' ').trim().slice(0, 1200),
    lines: content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 300),
  };
}

function latestSnapshotBefore(events, dateKey) {
  return events
    .filter((event) => event.source === SNAPSHOT_SOURCE && event.snapshot?.dateKey !== dateKey)
    .at(-1)?.snapshot || null;
}

function existingSnapshotForDate(events, dateKey) {
  return events
    .filter((event) => event.source === SNAPSHOT_SOURCE && event.snapshot?.dateKey === dateKey)
    .at(-1)?.snapshot || null;
}

function taskMap(tasks) {
  return new Map((tasks || []).map((task) => [task.guid || task.summary, task]));
}

function diffTaskList(current, previous) {
  if (!previous) {
    return [`${current.name}: baseline captured with ${current.taskCount} tasks (${current.openCount} open).`];
  }

  const changes = [];
  const previousTasks = taskMap(previous.tasks);
  const currentTasks = taskMap(current.tasks);

  if (current.openCount !== previous.openCount || current.taskCount !== previous.taskCount) {
    changes.push(`${current.name}: task count ${previous.taskCount} -> ${current.taskCount}; open ${previous.openCount} -> ${current.openCount}.`);
  }

  for (const task of current.tasks) {
    const before = previousTasks.get(task.guid || task.summary);
    if (!before) {
      changes.push(`${current.name}: added task "${task.summary || task.guid}".`);
      continue;
    }
    if (before.completed !== task.completed) {
      changes.push(`${current.name}: ${task.completed ? 'completed' : 'reopened'} "${task.summary || task.guid}".`);
    }
    if (before.summary !== task.summary) {
      changes.push(`${current.name}: renamed task "${before.summary}" -> "${task.summary}".`);
    }
    if (before.due !== task.due) {
      changes.push(`${current.name}: due date changed for "${task.summary || task.guid}".`);
    }
  }

  for (const task of previous.tasks) {
    if (!currentTasks.has(task.guid || task.summary)) {
      changes.push(`${current.name}: removed task "${task.summary || task.guid}".`);
    }
  }

  return changes;
}

function diffDocument(current, previous) {
  if (!current) return ['Live timeline document: unavailable during snapshot.'];
  if (!previous) return [`${current.title}: baseline captured for timeline-change tracking.`];
  if (current.contentHash === previous.contentHash) return [];

  const beforeLines = new Set(previous.lines || []);
  const afterLines = new Set(current.lines || []);
  const added = [...afterLines].filter((line) => !beforeLines.has(line)).slice(0, 8);
  const removed = [...beforeLines].filter((line) => !afterLines.has(line)).slice(0, 4);
  const changes = [`${current.title}: content changed since the prior snapshot.`];

  for (const line of added) changes.push(`${current.title}: added/changed line: ${line.slice(0, 220)}`);
  for (const line of removed) changes.push(`${current.title}: removed/changed line: ${line.slice(0, 220)}`);

  return changes;
}

function summarizeTaskList(taskList) {
  return `${taskList.name}: ${taskList.taskCount} tasks, ${taskList.openCount} open.`;
}

function formatSnapshotChanges(changes) {
  if (!changes?.length) return '(no task-list or timeline changes detected since the previous snapshot)';
  return changes.map((change) => `- ${change}`).join('\n');
}

function formatCurrentTaskState(snapshot) {
  const taskLists = snapshot?.taskLists || [];
  if (!taskLists.length) return '(no task-list state captured)';

  return taskLists.map((taskList) => {
    const openTasks = (taskList.tasks || [])
      .filter((task) => !task.completed)
      .map((task) => task.summary || task.guid)
      .filter(Boolean);
    const completedTasks = (taskList.tasks || [])
      .filter((task) => task.completed)
      .map((task) => task.summary || task.guid)
      .filter(Boolean);

    return [
      `${taskList.name}: ${taskList.taskCount} tasks, ${taskList.openCount} open.`,
      `Open tasks: ${openTasks.slice(0, 35).join('; ') || 'none'}.`,
      `Completed/closed tasks visible in list: ${completedTasks.slice(0, 12).join('; ') || 'none'}.`,
    ].join(' ');
  }).join('\n');
}

export async function captureAccountSnapshots({
  eventStore,
  taskClient,
  taskListGuids = [],
  timelineDocsClient,
  timelineWikiToken,
  dateKey,
  now = new Date(),
  force = false,
}) {
  if (!eventStore || !dateKey) return { changesText: '(snapshot memory unavailable)' };

  const events = await eventStore.all();
  const existing = existingSnapshotForDate(events, dateKey);
  if (existing && !force) {
    return {
      snapshot: existing,
      changes: existing.changes || [],
      changesText: formatSnapshotChanges(existing.changes || []),
      currentStateText: formatCurrentTaskState(existing),
    };
  }

  const previous = force && existing ? existing : latestSnapshotBefore(events, dateKey);
  const taskLists = [];
  const errors = [];

  for (const guid of taskListGuids) {
    if (!taskClient || !guid) continue;
    try {
      taskLists.push(normalizeTaskList(await taskClient.readTaskList(guid, { limit: 300 })));
    } catch (error) {
      errors.push(`Task list ${guid}: read failed: ${error.message}`);
    }
  }

  let timelineDoc = null;
  if (timelineDocsClient && timelineWikiToken) {
    try {
      timelineDoc = normalizeDocument(await timelineDocsClient.readWikiDocument(timelineWikiToken));
    } catch (error) {
      errors.push(`Live timeline document: read failed: ${error.message}`);
    }
  }

  const previousTaskListsByGuid = new Map((previous?.taskLists || []).map((taskList) => [taskList.guid, taskList]));
  const changes = [
    ...taskLists.flatMap((taskList) => diffTaskList(taskList, previousTaskListsByGuid.get(taskList.guid))),
    ...diffDocument(timelineDoc, previous?.timelineDoc),
    ...errors,
  ];

  const snapshot = {
    dateKey,
    capturedAt: now.toISOString(),
    taskLists,
    timelineDoc,
    taskListSummary: taskLists.map(summarizeTaskList),
    changes,
  };

  await eventStore.append({
    source: SNAPSHOT_SOURCE,
    provider: 'ron-scheduler',
    sourceEventId: `account-snapshot:${dateKey}`,
    sourceEventType: 'account_snapshot.captured',
    occurredAt: now.toISOString(),
    message: {
      id: `account-snapshot:${dateKey}`,
      type: 'snapshot',
      text: formatSnapshotChanges(changes),
    },
    snapshot,
    analysis: {
      actionItems: [],
      risks: errors,
      customerSignals: [],
      needsHumanReview: errors.length > 0,
    },
  });

  return {
    snapshot,
    changes,
    changesText: formatSnapshotChanges(changes),
    currentStateText: formatCurrentTaskState(snapshot),
  };
}
